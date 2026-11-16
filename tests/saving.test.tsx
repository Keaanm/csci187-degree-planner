// Keaan Mirchandani
// Tests autosaving the plan: when it saves, what is sent to the backend, and the save status.
// @vitest-environment jsdom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlanProvider from '../src/components/PlanProvider';
import SaveStatus from '../src/components/SaveStatus';
import { usePlan } from '../src/PlanContext';
import { fakeBackend } from './fakeBackend';

const DELAY = 200;
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

// Stands in for the plan page: buttons that edit the plan, and the plan's courses.
function PlanEditor() {
  const { plan, changePlan } = usePlan();
  return (
    <>
      <button onClick={() => changePlan(plan.addCourse(0, 'CSCI 10').markCompleted('CSCI 10'))}>Add CSCI 10</button>
      <button onClick={() => changePlan(plan.addCourse(0, 'MATH 11'))}>Add MATH 11</button>
      <button onClick={() => changePlan(plan.removeCourse(0, 'CSCI 10'))}>Undo</button>
      <output>{plan.toRows().map((r) => `${r.code} ${r.status}`).join(', ') || 'empty'}</output>
    </>
  );
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<p>Loading…</p>}>
        <PlanProvider planId={1} autosaveDelay={DELAY}>
          <SaveStatus />
          <PlanEditor />
        </PlanProvider>
      </Suspense>
    </QueryClientProvider>,
  );
}

const click = async (name: string) => fireEvent.click(await screen.findByText(name));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('autosaving the plan', () => {
  it('has no save button', async () => {
    fakeBackend();
    renderApp();
    await screen.findByText('Not saved yet');
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('starts with an empty plan and saves nothing until it changes', async () => {
    const puts = fakeBackend();
    renderApp();
    expect(await screen.findByText('Not saved yet')).toBeTruthy();
    expect(screen.getByText('empty')).toBeTruthy();
    await wait(DELAY * 3);
    expect([...puts]).toEqual([]);
  });

  it('shows when the plan was last saved', async () => {
    fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [] } });
    renderApp();
    expect(await screen.findByText(/^Saved /)).toBeTruthy();
  });

  it('saves the whole plan, with completed courses, shortly after an edit', async () => {
    const puts = fakeBackend();
    renderApp();
    await click('Add CSCI 10');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(await screen.findByText(/^Saved /, {}, { timeout: 2000 })).toBeTruthy();
    expect([...puts]).toEqual([{ courses: [{ code: 'CSCI 10', quarter: 0, status: 'completed' }] }]);
  });

  it('saves once after several quick edits', async () => {
    const puts = fakeBackend();
    renderApp();
    await click('Add CSCI 10');
    await click('Add MATH 11');
    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    expect([...puts]).toEqual([
      {
        courses: [
          { code: 'CSCI 10', quarter: 0, status: 'completed' },
          { code: 'MATH 11', quarter: 0, status: 'planned' },
        ],
      },
    ]);
  });

  it('saves nothing when an edit is undone before it saves', async () => {
    const puts = fakeBackend();
    renderApp();
    await click('Add CSCI 10');
    await click('Undo');
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    await wait(DELAY * 3);
    expect([...puts]).toEqual([]);
  });

  it('saves edits made during a save afterwards, one save at a time', async () => {
    const puts = fakeBackend({ saveDelayMs: DELAY * 2 });
    renderApp();
    await click('Add CSCI 10');
    await screen.findByText('Saving…', {}, { timeout: 2000 });
    await click('Add MATH 11');
    await waitFor(() => expect(puts).toHaveLength(2), { timeout: 2000 });
    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    expect(puts.mostAtOnce).toBe(1);
    expect(puts[1]).toEqual({
      courses: [
        { code: 'CSCI 10', quarter: 0, status: 'completed' },
        { code: 'MATH 11', quarter: 0, status: 'planned' },
      ],
    });
  });

  it("keeps the edits, shows the server's message, and doesn't retry in a loop when saving fails", async () => {
    const puts = fakeBackend({ saveError: 'CSCI 10 is not an offered course' });
    renderApp();
    await click('Add CSCI 10');
    expect(await screen.findByText("Couldn't save: CSCI 10 is not an offered course", {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByText('CSCI 10 completed')).toBeTruthy();
    await wait(DELAY * 3);
    expect(puts).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(puts).toHaveLength(2), { timeout: 2000 });
  });

  it('clears the save error and saves again once the plan changes', async () => {
    const puts = fakeBackend({ saveError: 'CSCI 10 is not an offered course' });
    renderApp();
    await click('Add CSCI 10');
    await screen.findByText(/Couldn't save/, {}, { timeout: 2000 });
    await click('Add MATH 11');
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
    await waitFor(() => expect(puts).toHaveLength(2), { timeout: 2000 });
  });

  it('asks before closing the tab while there are unsaved changes', async () => {
    fakeBackend();
    renderApp();
    await click('Add CSCI 10');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('loads the saved plan, including which courses are completed', async () => {
    fakeBackend({
      saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [{ code: 'CSCI 10', quarter: 0, status: 'completed' }] },
    });
    renderApp();
    expect(await screen.findByText('CSCI 10 completed')).toBeTruthy();
  });
});

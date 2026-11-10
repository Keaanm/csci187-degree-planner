// Keaan Mirchandani
// Tests saving the plan in the app: the unsaved draft, the save bar, and what is sent to the backend.
// @vitest-environment jsdom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlanProvider from '../src/components/PlanProvider';
import SaveBar from '../src/components/SaveBar';
import { usePlan } from '../src/PlanContext';
import { fakeBackend } from './fakeBackend';

// Stands in for the plan page: buttons that edit the plan, and the plan's courses.
function PlanEditor() {
  const { plan, changePlan } = usePlan();
  return (
    <>
      <button onClick={() => changePlan(plan.addCourse(0, 'CSCI 10').markCompleted('CSCI 10'))}>Add CSCI 10</button>
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
        <PlanProvider>
          <SaveBar />
          <PlanEditor />
        </PlanProvider>
      </Suspense>
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByRole('button', { name: /save plan/i });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('saving the plan', () => {
  it('starts with nothing to save when the plan has never been saved', async () => {
    fakeBackend();
    renderApp();
    expect(await screen.findByText('Not saved yet')).toBeTruthy();
    expect(screen.getByText('empty')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
  });

  it('shows when the plan was last saved', async () => {
    fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [] } });
    renderApp();
    expect(await screen.findByText(/^Saved /)).toBeTruthy();
  });

  it('shows unsaved changes after an edit', async () => {
    fakeBackend();
    renderApp();
    fireEvent.click(await screen.findByText('Add CSCI 10'));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(false);
  });

  it('shows the plan as saved again after an edit is undone', async () => {
    fakeBackend();
    renderApp();
    fireEvent.click(await screen.findByText('Add CSCI 10'));
    fireEvent.click(screen.getByText('Undo'));
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
  });

  it('sends the whole plan, with completed courses, when Save is clicked', async () => {
    const puts = fakeBackend();
    renderApp();
    fireEvent.click(await screen.findByText('Add CSCI 10'));
    fireEvent.click(saveButton());
    expect(await screen.findByText(/^Saved /)).toBeTruthy();
    expect(puts).toEqual([{ courses: [{ code: 'CSCI 10', quarter: 0, status: 'completed' }] }]);
    expect(saveButton().hasAttribute('disabled')).toBe(true);
  });

  it("keeps the edits and shows the server's message when saving fails", async () => {
    fakeBackend({ saveError: 'CSCI 10 is not an offered course' });
    renderApp();
    fireEvent.click(await screen.findByText('Add CSCI 10'));
    fireEvent.click(saveButton());
    expect(await screen.findByText(/Couldn't save: CSCI 10 is not an offered course/)).toBeTruthy();
    await waitFor(() => expect(saveButton().hasAttribute('disabled')).toBe(false));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('clears the save error once the plan changes', async () => {
    fakeBackend({ saveError: 'CSCI 10 is not an offered course' });
    renderApp();
    fireEvent.click(await screen.findByText('Add CSCI 10'));
    fireEvent.click(saveButton());
    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
    fireEvent.click(screen.getByText('Undo'));
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
  });

  it('shows when the plan was last saved next to unsaved changes', async () => {
    fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [] } });
    renderApp();
    fireEvent.click(await screen.findByText('Add CSCI 10'));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText(/^Saved /)).toBeTruthy();
  });

  it('loads the saved plan, including which courses are completed', async () => {
    fakeBackend({
      saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [{ code: 'CSCI 10', quarter: 0, status: 'completed' }] },
    });
    renderApp();
    expect(await screen.findByText('CSCI 10 completed')).toBeTruthy();
  });
});

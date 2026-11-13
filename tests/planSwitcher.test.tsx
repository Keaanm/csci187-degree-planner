// Keaan Mirchandani
// Tests switching between several plans, and making, copying, renaming and deleting them.
// @vitest-environment jsdom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlansProvider from '../src/components/PlansProvider';
import PlanSwitcher from '../src/components/PlanSwitcher';
import SaveStatus from '../src/components/SaveStatus';
import { usePlan } from '../src/PlanContext';
import { ACCOUNT, fakeBackend } from './fakeBackend';

const DELAY = 100;
const CSCI_10 = { code: 'CSCI 10', quarter: 0, status: 'completed' };
const MATH_11 = { code: 'MATH 11', quarter: 0, status: 'planned' };

// The open plan's courses, and a button that edits it.
function PlanProbe() {
  const { plan, changePlan } = usePlan();
  return (
    <>
      <button onClick={() => changePlan(plan.addCourse(1, 'CSCI 60'))}>Add CSCI 60</button>
      <output>{plan.toRows().map((r) => r.code).join(', ') || 'no courses'}</output>
    </>
  );
}

function renderSwitcher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<p>Loading…</p>}>
        <PlansProvider student={ACCOUNT} autosaveDelay={DELAY}>
          <PlanSwitcher />
          <SaveStatus />
          <PlanProbe />
        </PlansProvider>
      </Suspense>
    </QueryClientProvider>,
  );
}

const picker = () => screen.findByRole('combobox', { name: 'Plan' }) as Promise<HTMLSelectElement>;
const optionNames = async () => [...(await picker()).options].map((o) => o.text);
const openPlan = async (name: string) => {
  const select = await picker();
  const option = [...select.options].find((o) => o.text === name);
  fireEvent.change(select, { target: { value: option?.value } });
};
const courses = (text: string) => screen.findByText(text, { selector: 'output' });
const dialog = () => screen.findByRole('dialog');
const click = (name: string, within_?: HTMLElement) =>
  fireEvent.click((within_ ? within(within_) : screen).getByRole('button', { name }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('switching plans', () => {
  it('opens the oldest plan first and lists every plan', async () => {
    fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] }, extraPlans: [{ name: 'Abroad' }] });
    renderSwitcher();
    expect(await optionNames()).toEqual(['Main plan', 'Abroad']);
    expect((await picker()).selectedOptions[0].text).toBe('Main plan');
    expect(await courses('CSCI 10')).toBeTruthy();
  });

  it("opens another plan's courses", async () => {
    fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] }, extraPlans: [{ name: 'Abroad', courses: [MATH_11] }] });
    renderSwitcher();
    await courses('CSCI 10');
    await openPlan('Abroad');
    expect(await courses('MATH 11')).toBeTruthy();
  });

  it('saves edits to the plan they were made in', async () => {
    const backend = fakeBackend({ extraPlans: [{ name: 'Abroad' }] });
    renderSwitcher();
    await courses('no courses');
    await openPlan('Abroad');
    await waitFor(async () => expect((await picker()).selectedOptions[0].text).toBe('Abroad'));
    click('Add CSCI 60');
    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    expect(backend.requests).toContain('PUT /api/me/plans/2');
    expect(backend.plans()[0].courses).toEqual([]);
    expect(backend.plans()[1].courses).toEqual([{ code: 'CSCI 60', quarter: 1, status: 'planned' }]);
  });

  it('waits for unsaved changes to save before opening another plan', async () => {
    const backend = fakeBackend({ extraPlans: [{ name: 'Abroad', courses: [MATH_11] }] });
    renderSwitcher();
    await courses('no courses');
    click('Add CSCI 60');
    await openPlan('Abroad');
    expect(await screen.findByText('Your changes are still saving')).toBeTruthy();
    expect(await courses('MATH 11')).toBeTruthy();
    expect(backend.plans()[0].courses).toEqual([{ code: 'CSCI 60', quarter: 1, status: 'planned' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("can stay on a plan whose changes couldn't be saved", async () => {
    fakeBackend({ saveError: 'The server is down', extraPlans: [{ name: 'Abroad', courses: [MATH_11] }] });
    renderSwitcher();
    await courses('no courses');
    click('Add CSCI 60');
    await screen.findByText(/Couldn't save/, {}, { timeout: 2000 });
    await openPlan('Abroad');
    click('Stay on this plan', await dialog());
    expect(await courses('CSCI 60')).toBeTruthy();
    expect((await picker()).selectedOptions[0].text).toBe('Main plan');
  });

  it('remembers the open plan for next time', async () => {
    fakeBackend({ extraPlans: [{ name: 'Abroad', courses: [MATH_11] }] });
    renderSwitcher();
    await openPlan('Abroad');
    await courses('MATH 11');
    cleanup();
    renderSwitcher();
    expect(await courses('MATH 11')).toBeTruthy();
  });

  it('makes a "Main plan" for a student who has none', async () => {
    const backend = fakeBackend();
    backend.plans().splice(0);
    renderSwitcher();
    expect(await optionNames()).toEqual(['Main plan']);
    expect(backend.plans().map((p) => p.name)).toEqual(['Main plan']);
  });
});

describe('making plans', () => {
  it('makes an empty plan and opens it', async () => {
    const backend = fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] } });
    renderSwitcher();
    await courses('CSCI 10');
    click('New plan');
    fireEvent.change(within(await dialog()).getByLabelText('Name'), { target: { value: '  What if I study abroad ' } });
    click('Make plan', await dialog());
    expect(await courses('no courses')).toBeTruthy();
    expect(await optionNames()).toEqual(['Main plan', 'What if I study abroad']);
    expect((await picker()).selectedOptions[0].text).toBe('What if I study abroad');
    expect(backend.posts.at(-1)).toEqual({ url: '/api/me/plans', body: { name: 'What if I study abroad' } });
  });

  it('copies the open plan', async () => {
    const backend = fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] } });
    renderSwitcher();
    await courses('CSCI 10');
    click('New plan');
    const form = await dialog();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Copy' } });
    fireEvent.click(within(form).getByLabelText('A copy of “Main plan”'));
    click('Make plan', form);
    await waitFor(async () => expect((await picker()).selectedOptions[0].text).toBe('Copy'));
    expect(await courses('CSCI 10')).toBeTruthy();
    expect(backend.posts.at(-1)).toEqual({ url: '/api/me/plans', body: { name: 'Copy', copyFrom: 1 } });
  });

  it('needs a name', async () => {
    const backend = fakeBackend();
    renderSwitcher();
    await picker();
    click('New plan');
    click('Make plan', await dialog());
    expect(await screen.findByText('Give the plan a name')).toBeTruthy();
    expect(backend.posts).toEqual([]);
  });
});

describe('renaming and deleting plans', () => {
  it('renames the open plan', async () => {
    const backend = fakeBackend();
    renderSwitcher();
    await picker();
    click('Rename');
    fireEvent.change(within(await dialog()).getByLabelText('Name'), { target: { value: 'Plan A' } });
    click('Rename', await dialog());
    await waitFor(async () => expect(await optionNames()).toEqual(['Plan A']));
    expect(backend.plans()[0].name).toBe('Plan A');
  });

  it("can't delete the only plan", async () => {
    fakeBackend();
    renderSwitcher();
    await picker();
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks before deleting, then opens the oldest plan left', async () => {
    const backend = fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] }, extraPlans: [{ name: 'Abroad', courses: [MATH_11] }] });
    renderSwitcher();
    await openPlan('Abroad');
    await courses('MATH 11');
    click('Delete');
    const confirm = await dialog();
    expect(within(confirm).getByText('Delete “Abroad”?')).toBeTruthy();
    click('Keep it', confirm);
    expect(backend.plans()).toHaveLength(2);
    click('Delete');
    click('Delete plan', await dialog());
    expect(await courses('CSCI 10')).toBeTruthy();
    expect(await optionNames()).toEqual(['Main plan']);
    expect(backend.plans().map((p) => p.name)).toEqual(['Main plan']);
  });
});

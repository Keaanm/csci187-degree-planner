// Keaan Mirchandani
// Tests switching between several plans, and making, copying, renaming and deleting them.
// @vitest-environment jsdom
import { act, Suspense } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlansProvider from '../src/components/PlansProvider';
import PlanSwitcher from '../src/components/PlanSwitcher';
import SaveStatus from '../src/components/SaveStatus';
import { usePlan } from '../src/PlanContext';
import { createQueryClient } from '../src/queries';
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

// Counts how many times the page fell back to "Loading…".
let loadingShown = 0;
function Loading() {
  loadingShown++;
  return <p>Loading…</p>;
}

function renderSwitcher() {
  const client = createQueryClient({ retry: 0 });  // the app's, so a 404 reloads the plan list
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<Loading />}>
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

  it('waits for unsaved changes to save, then copies the plan with them', async () => {
    const backend = fakeBackend({ saveDelayMs: 200 });
    renderSwitcher();
    await courses('no courses');
    click('Add CSCI 60');
    click('New plan');
    const form = await dialog();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Copy' } });
    fireEvent.click(within(form).getByLabelText('A copy of “Main plan”'));
    click('Make plan', form);
    expect(await screen.findByText('Saving your changes first…')).toBeTruthy();
    await waitFor(async () => expect((await picker()).selectedOptions[0].text).toBe('Copy'), { timeout: 3000 });
    expect(await courses('CSCI 60')).toBeTruthy();
    expect(backend.plans()[1].courses).toEqual([{ code: 'CSCI 60', quarter: 1, status: 'planned' }]);
  });

  it("copies the last saved version when the changes couldn't be saved, and says so", async () => {
    const backend = fakeBackend({ saveError: 'The server is down', saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] } });
    renderSwitcher();
    await courses('CSCI 10');
    click('Add CSCI 60');
    await screen.findByText(/Couldn't save/, {}, { timeout: 2000 });
    click('New plan');
    const form = await dialog();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Copy' } });
    fireEvent.click(within(form).getByLabelText('A copy of “Main plan”'));
    expect(within(form).getByText(/the copy will have the last saved version/)).toBeTruthy();
    click('Make plan', form);
    await waitFor(() => expect(backend.plans()).toHaveLength(2));
    expect(backend.plans()[1].courses).toEqual([CSCI_10]);
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

describe('a new plan that gets a deleted plan\'s id (#22)', () => {
  // The server reuses the id of the newest plan after it's deleted.
  const makeAndOpen = async (name: string, copy = false) => {
    click('New plan');
    const form = await dialog();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: name } });
    if (copy) fireEvent.click(within(form).getByLabelText('A copy of “Main plan”'));
    click('Make plan', form);
    await waitFor(async () => expect((await picker()).selectedOptions[0].text).toBe(name));
  };
  const deleteOpenPlan = async () => {
    click('Delete');
    click('Delete plan', await dialog());
    await waitFor(async () => expect((await picker()).selectedOptions[0].text).toBe('Main plan'));
  };

  it("starts empty instead of showing the deleted plan's courses", async () => {
    const backend = fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] } });
    renderSwitcher();
    await courses('CSCI 10');
    await makeAndOpen('Abroad');
    click('Add CSCI 60');
    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    await deleteOpenPlan();
    await makeAndOpen('Fresh');
    expect(backend.plans()[1].planId).toBe(2);  // the deleted plan's id
    expect(await courses('no courses')).toBeTruthy();
  });

  it("copies the open plan, not the deleted plan, and doesn't save the deleted plan's courses over it", async () => {
    const backend = fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] } });
    renderSwitcher();
    await courses('CSCI 10');
    await makeAndOpen('Abroad');
    click('Add CSCI 60');
    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    await deleteOpenPlan();
    await makeAndOpen('Copy', true);
    expect(await courses('CSCI 10')).toBeTruthy();
    click('Add CSCI 60');
    await screen.findByText(/^Saved /, {}, { timeout: 2000 });
    expect(backend.plans()[1].courses).toEqual([CSCI_10, { code: 'CSCI 60', quarter: 1, status: 'planned' }]);
  });
});

describe('plans changed in another tab', () => {
  it('shows plans made and deleted in another tab when the window comes back into focus', async () => {
    const backend = fakeBackend({ extraPlans: [{ name: 'Abroad' }] });
    renderSwitcher();
    expect(await optionNames()).toEqual(['Main plan', 'Abroad']);
    backend.plans().splice(1, 1, { planId: 9, name: 'Made elsewhere', programId: null, lastSaved: null, courses: [] });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(async () => expect(await optionNames()).toEqual(['Main plan', 'Made elsewhere']));
    focusManager.setFocused(undefined);
  });

  it('opens the oldest plan when the open one was deleted in another tab, instead of failing every save', async () => {
    const backend = fakeBackend({ saved: { lastSaved: '2026-11-01T18:00:00.000Z', courses: [CSCI_10] }, extraPlans: [{ name: 'Abroad', courses: [MATH_11] }] });
    renderSwitcher();
    await openPlan('Abroad');
    await courses('MATH 11');
    backend.plans().splice(1, 1);  // deleted in another tab
    click('Add CSCI 60');
    expect(await courses('CSCI 10')).toBeTruthy();
    expect(await optionNames()).toEqual(['Main plan']);
    expect(backend.plans()[0].courses).toEqual([CSCI_10]);
  });
});

describe('plan names', () => {
  it('counts an emoji as one character, like the server', async () => {
    const backend = fakeBackend();
    renderSwitcher();
    await picker();
    click('Rename');
    const name = within(await dialog()).getByLabelText('Name');
    fireEvent.change(name, { target: { value: '🎓'.repeat(61) } });
    click('Rename', await dialog());
    expect(await screen.findByText('Use at most 60 characters')).toBeTruthy();
    fireEvent.change(name, { target: { value: '🎓'.repeat(60) } });
    click('Rename', await dialog());
    await waitFor(() => expect(backend.plans()[0].name).toBe('🎓'.repeat(60)));
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
    localStorage.setItem(`degreePlanner.openPlan.${ACCOUNT.email}`, '2');  // Main plan is never loaded
    renderSwitcher();
    await courses('MATH 11');
    click('Delete');
    const confirm = await dialog();
    expect(within(confirm).getByText('Delete “Abroad”?')).toBeTruthy();
    click('Keep it', confirm);
    expect(backend.plans()).toHaveLength(2);
    click('Delete');
    loadingShown = 0;
    click('Delete plan', await dialog());
    expect(await courses('CSCI 10')).toBeTruthy();
    expect(loadingShown).toBe(0);  // straight from one plan to the other
    expect(await optionNames()).toEqual(['Main plan']);
    expect(backend.plans().map((p) => p.name)).toEqual(['Main plan']);
  });
});

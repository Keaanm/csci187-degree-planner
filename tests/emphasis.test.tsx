// Keaan Mirchandani
// Tests choosing a plan's emphasis, and that the plan then checks that emphasis's requirements.
// @vitest-environment jsdom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlansProvider from '../src/components/PlansProvider';
import PlanSummary from '../src/components/PlanSummary';
import PlanSwitcher from '../src/components/PlanSwitcher';
import RequirementsPanel from '../src/components/RequirementsPanel';
import { ACCOUNT, fakeBackend } from './fakeBackend';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Suspense fallback={<p>Loading…</p>}>
          <PlansProvider student={ACCOUNT}>
            <PlanSwitcher />
            <PlanSummary />
            <RequirementsPanel />
          </PlansProvider>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emphasis = () => screen.findByRole('combobox', { name: 'Emphasis' }) as Promise<HTMLSelectElement>;
const choose = async (name: string) => {
  const select = await emphasis();
  const option = [...select.options].find((o) => o.text === name);
  fireEvent.change(select, { target: { value: option?.value } });
};
const has = (text: string) => screen.queryAllByText(text, { exact: false }).length > 0;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('choosing an emphasis', () => {
  it('lists the four emphases', async () => {
    fakeBackend();
    renderPanel();
    expect([...(await emphasis()).options].map((o) => o.text)).toEqual([
      'Choose an emphasis',
      'Software',
      'Algorithms and Complexity',
      'Data Science',
      'Security',
    ]);
  });

  it("checks the major's and the chosen emphasis's requirements, but not the other emphases'", async () => {
    fakeBackend({ programId: 2 });
    renderPanel();
    expect((await emphasis()).selectedOptions[0].text).toBe('Software');
    expect(has('Software emphasis')).toBe(true);
    expect(has('Lower-division computer science')).toBe(true);
    expect(has('Security emphasis')).toBe(false);
    expect(has('Core:')).toBe(false);
    expect(screen.getByText(/0 of 7 requirements completed/)).toBeTruthy();
  });

  it('asks for an emphasis and only checks the major until one is chosen', async () => {
    fakeBackend({ programId: null });
    renderPanel();
    expect(await screen.findByText(/Choose your emphasis to see its requirements/)).toBeTruthy();
    expect(has('Software emphasis')).toBe(false);
    expect(screen.getByText(/0 of 5 requirements completed/)).toBeTruthy();
  });

  it('saves the choice to the plan and checks the new requirements', async () => {
    const backend = fakeBackend({ programId: 2 });
    renderPanel();
    await choose('Security');
    await waitFor(() => expect(has('Security emphasis')).toBe(true));
    expect(has('Software emphasis')).toBe(false);
    expect(backend.plans()[0].programId).toBe(5);
    expect(backend.requests).toContain('PATCH /api/me/plans/1');
    expect(screen.queryByText(/Choose your emphasis/)).toBeNull();
  });

  it('each plan keeps its own emphasis', async () => {
    fakeBackend({ programId: 2, extraPlans: [{ name: 'Data' }] });
    renderPanel();
    await emphasis();
    // Opening a plan remounts the picker, so it's looked up again each time.
    const openPlan = async (planId: string) =>
      fireEvent.change(await screen.findByRole('combobox', { name: 'Plan' }), { target: { value: planId } });
    await openPlan('2');
    await waitFor(async () => expect((await emphasis()).selectedOptions[0].text).toBe('Choose an emphasis'));
    await choose('Data Science');
    await waitFor(() => expect(has('Data Science emphasis')).toBe(true));
    await openPlan('1');
    await waitFor(() => expect(has('Software emphasis')).toBe(true));
    await waitFor(async () => expect((await emphasis()).selectedOptions[0].text).toBe('Software'));
    expect(has('Data Science emphasis')).toBe(false);
  });
});

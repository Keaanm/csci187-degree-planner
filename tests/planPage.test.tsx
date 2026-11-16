// Keaan Mirchandani
// Tests the plan page: the summary, the requirements panel, and marking and adding courses.
// @vitest-environment jsdom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlansProvider from '../src/components/PlansProvider';
import PlanPage from '../src/pages/PlanPage';
import { ACCOUNT, fakeBackend } from './fakeBackend';
import type { SavedPlan } from './fakeBackend';

function renderPage(saved?: SavedPlan) {
  fakeBackend({ saved });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Suspense fallback={<p>Loading…</p>}>
          <PlansProvider student={ACCOUNT}>
            <PlanPage />
          </PlansProvider>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const requirement = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('plan page', () => {
  it('tells a new student where to start', async () => {
    renderPage();
    expect(await screen.findByText(/Start by adding the courses you have already taken/)).toBeTruthy();
    expect(screen.getByText('0 of 7 requirements completed')).toBeTruthy();
  });

  it('marks a course completed and counts it in the summary and requirements', async () => {
    renderPage({
      lastSaved: '2026-11-01T18:00:00.000Z',
      courses: [{ code: 'CHEM 11', quarter: 0, status: 'planned' }],
    });
    const toggle = await screen.findByRole('button', { name: 'CHEM 11 completed' });
    expect(within(requirement('Natural science (one course)')).getByText('Covered by your plan')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1 of 7 requirements completed')).toBeTruthy();
    expect(screen.getByText(/5 units completed/)).toBeTruthy();
    expect(within(requirement('Natural science (one course)')).getByText('Completed')).toBeTruthy();
  });

  it('adds a missing course from the requirements panel to the chosen quarter', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add MATH 11 to the plan' }));
    fireEvent.click(screen.getByRole('button', { name: /^Year 2 Winter/ }));

    const year2 = screen.getByRole('region', { name: 'Year 2' });
    expect(within(year2).getByText('MATH 11')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add MATH 11 to the plan' })).toBeNull();
  });

  it('shows why a course could not be added and keeps the menu open', async () => {
    renderPage({
      lastSaved: '2026-11-01T18:00:00.000Z',
      courses: ['CSCI 10', 'CSCI 60', 'MATH 11', 'MATH 12'].map((code) => ({ code, quarter: 0, status: 'planned' })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Add MATH 13 to the plan' }));
    fireEvent.click(screen.getByRole('button', { name: /^Year 1 Fall/ }));
    expect(screen.getByText("Year 1 Fall can't have more than 18 units")).toBeTruthy();
    expect(screen.getByText('Add MATH 13 to…')).toBeTruthy();
  });

  it('clears a quarter error once the plan changes', async () => {
    // The course search menu uses browser APIs that jsdom doesn't have.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = () => {};
    renderPage({
      lastSaved: '2026-11-01T18:00:00.000Z',
      courses: ['CSCI 10', 'CSCI 60', 'MATH 11', 'MATH 12'].map((code) => ({ code, quarter: 0, status: 'planned' })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Add a course to Year 1 Fall' }));
    fireEvent.click(screen.getByRole('option', { name: /^MATH 13/ }));
    const error = "Year 1 Fall can't have more than 18 units";
    expect(screen.getByText(error)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove MATH 12' }));
    expect(screen.queryByText(error)).toBeNull();
  });

  it('only offers courses that are not in the plan yet', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = () => {};
    renderPage({ lastSaved: '2026-11-01T18:00:00.000Z', courses: [{ code: 'CSCI 10', quarter: 0, status: 'planned' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Add a course to Year 1 Winter' }));
    expect(screen.queryByRole('option', { name: /^CSCI 10/ })).toBeNull();
    expect(screen.getByRole('option', { name: /^CSCI 60/ })).toBeTruthy();
  });

  it('warns on a course placed before its prerequisites', async () => {
    renderPage({
      lastSaved: '2026-11-01T18:00:00.000Z',
      courses: [
        { code: 'CSCI 60', quarter: 0, status: 'planned' },
        { code: 'CSCI 10', quarter: 0, status: 'planned' },
      ],
    });
    const course = (await screen.findByRole('button', { name: 'CSCI 60 completed' })).closest('li') as HTMLElement;
    expect(within(course).getByRole('alert').textContent).toBe('Take CSCI 10 in an earlier quarter first');
  });

  it('sums units completed, planned and not planned yet', async () => {
    renderPage({
      lastSaved: '2026-11-01T18:00:00.000Z',
      courses: [
        { code: 'CSCI 10', quarter: 0, status: 'completed' },
        { code: 'MATH 11', quarter: 0, status: 'planned' },
      ],
    });
    expect(await screen.findByText(/5 units completed/)).toBeTruthy();
    expect(screen.getByText(/4 planned/)).toBeTruthy();
    expect(screen.getByText('93 not planned yet, of the 102 units these requirements need')).toBeTruthy();
  });

  it('shows the save status on the plan page', async () => {
    renderPage();
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Not saved yet');
  });
});

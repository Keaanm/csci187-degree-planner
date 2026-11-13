// Keaan Mirchandani
// Tests the course lookup page and the course detail page.
// @vitest-environment jsdom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlanProvider from '../src/components/PlanProvider';
import CoursePage from '../src/pages/CoursePage';
import CoursesPage from '../src/pages/CoursesPage';
import { fakeBackend } from './fakeBackend';

function renderAt(path: string) {
  fakeBackend({
    saved: {
      lastSaved: '2026-11-01T18:00:00.000Z',
      courses: [
        { code: 'CSCI 10', quarter: 0, status: 'completed' },
        { code: 'CSCI 60', quarter: 1, status: 'planned' },
      ],
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={<p>Loading…</p>}>
          <PlanProvider planId={1}>
            <Routes>
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/courses/:code" element={<CoursePage />} />
            </Routes>
          </PlanProvider>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const search = () => screen.getByRole('searchbox', { name: 'Search courses' }) as HTMLInputElement;
// A card's name runs the code into its badge and title, e.g. "CSCI 10CompletedIntroduction…".
const cardName = (code: string) => new RegExp(`^${code}(?!\\d)`);
const card = (code: string) => screen.getByRole('link', { name: cardName(code) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('course lookup page', () => {
  it('lists every offered course and filters as the student types', async () => {
    renderAt('/courses');
    expect(await screen.findByText('51 of 51 courses')).toBeTruthy();
    fireEvent.change(search(), { target: { value: 'data structures' } });
    expect(screen.getByText('3 of 51 courses')).toBeTruthy();
    expect(card('CSCI 61')).toBeTruthy();
  });

  it('shows which courses are completed or in the plan', async () => {
    renderAt('/courses');
    expect(within(await screen.findByRole('link', { name: cardName('CSCI 10') })).getByText('Completed')).toBeTruthy();
    expect(within(card('CSCI 60')).getByText('In plan')).toBeTruthy();
    expect(within(card('CSCI 61')).queryByText(/Completed|In plan/)).toBeNull();
  });

  it('keeps the search when going to a course and back', async () => {
    renderAt('/courses');
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search courses' }), {
      target: { value: 'data structures' },
    });
    fireEvent.click(card('CSCI 61'));
    fireEvent.click(await screen.findByRole('link', { name: 'All courses' }));
    expect(search().value).toBe('data structures');
    expect(await screen.findByText('3 of 51 courses')).toBeTruthy();
  });
});

describe('course page', () => {
  it('shows the details, either/or prerequisites, requirements and what it is a prerequisite for', async () => {
    renderAt('/courses/CSCI%2062');
    expect(await screen.findByRole('heading', { name: 'CSCI 62: Advanced Programming' })).toBeTruthy();
    expect(screen.getByText('4 units')).toBeTruthy();
    const prerequisites = screen.getByText('Prerequisites').closest('[data-slot=card]') as HTMLElement;
    expect(within(prerequisites).getByText(/CSCI 61/).closest('li')?.textContent).toBe('CSCI 61 or CSEN 79');
    expect(within(prerequisites).getByRole('link', { name: 'CSEN 79' }).getAttribute('href')).toBe('/courses/CSEN%2079');
    expect(screen.getByText('Lower-division computer science')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'CSCI 187' }).getAttribute('href')).toBe('/courses/CSCI%20187');
  });

  it('shows whether the course is completed or planned', async () => {
    renderAt('/courses/CSCI%2010');
    expect(await screen.findByText('Completed in Year 1 Fall')).toBeTruthy();
  });

  it('says so for a code that is not offered', async () => {
    renderAt('/courses/FAKE%201');
    expect(await screen.findByText('No offered course has the code FAKE 1.')).toBeTruthy();
  });
});

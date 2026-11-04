import { Suspense } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import LoadError from '@/components/LoadError';
import Logo from '@/components/Logo';
import NavItem from '@/components/NavItem';
import PlanProvider from '@/components/PlanProvider';
import SaveBar from '@/components/SaveBar';
import CoursePage from '@/pages/CoursePage';
import CoursesPage from '@/pages/CoursesPage';
import PlanPage from '@/pages/PlanPage';

export default function App() {
  return (
    <BrowserRouter>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset} FallbackComponent={LoadError}>
            <Suspense fallback={<p className="px-4 py-6">Loading…</p>}>
              <PlanProvider>
                <header className="sticky top-0 z-10 border-b bg-background">
                  <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <nav className="flex items-center gap-5">
                      <Link to="/" className="flex items-center gap-2 font-semibold">
                        <Logo className="size-7" />
                        SCU Degree Planner
                      </Link>
                      <NavItem to="/">My Plan</NavItem>
                      <NavItem to="/courses">Courses</NavItem>
                    </nav>
                    <SaveBar />
                  </div>
                </header>
                <main className="mx-auto max-w-6xl px-4 py-6">
                  <Routes>
                    <Route path="/" element={<PlanPage />} />
                    <Route path="/courses" element={<CoursesPage />} />
                    <Route path="/courses/:code" element={<CoursePage />} />
                  </Routes>
                </main>
              </PlanProvider>
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </BrowserRouter>
  );
}

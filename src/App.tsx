import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import type { Student } from '@/api';
import AccountMenu from '@/components/AccountMenu';
import LoadError from '@/components/LoadError';
import Logo from '@/components/Logo';
import NavItem from '@/components/NavItem';
import PlansProvider from '@/components/PlansProvider';
import CoursePage from '@/pages/CoursePage';
import CoursesPage from '@/pages/CoursesPage';
import LogInPage from '@/pages/LogInPage';
import PlanPage from '@/pages/PlanPage';
import SignUpPage from '@/pages/SignUpPage';
import { useMe, useSessionEnd } from '@/queries';

export default function App() {
  return (
    <BrowserRouter>
      <Loading>
        <AuthGate />
      </Loading>
    </BrowserRouter>
  );
}

// Shows "Loading…" while data loads, and LoadError (with Try again) if it can't.
function Loading({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset} FallbackComponent={LoadError}>
          <Suspense fallback={<p className="px-4 py-6">Loading…</p>}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

// Logged out, only the log-in and sign-up pages exist. When the session ends (logging out,
// or a 401 from any route), the planner unmounts and the student lands on the login page.
function AuthGate() {
  const student = useMe();
  const sessionEnd = useSessionEnd();
  const location = useLocation();
  if (!student) {
    // Remember the page to come back to, except after logging out on purpose: the next
    // person to log in shouldn't land on the last student's page.
    const from = sessionEnd === 'loggedOut' ? undefined : { from: location.pathname + location.search };
    return (
      <Routes>
        <Route path="/login" element={<LogInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={from} />} />
      </Routes>
    );
  }
  return <Planner student={student} />;
}

function Planner({ student }: { student: Student }) {
  const location = useLocation();
  // After logging in, go back to the page the student first asked for.
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  return (
    <Loading>
      <PlansProvider student={student}>
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <nav className="flex items-center gap-5">
              <Link to="/" className="flex items-center gap-2 font-semibold">
                <Logo className="size-7" />
                SCU Degree Planner
              </Link>
              <NavItem to="/">My Plan</NavItem>
              <NavItem to="/courses">Courses</NavItem>
            </nav>
            <AccountMenu student={student} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Routes>
            <Route path="/" element={<PlanPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/:code" element={<CoursePage />} />
            <Route path="/login" element={<Navigate to={from} replace />} />
            <Route path="/signup" element={<Navigate to={from} replace />} />
          </Routes>
        </main>
      </PlansProvider>
    </Loading>
  );
}

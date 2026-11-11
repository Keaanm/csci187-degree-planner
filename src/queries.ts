import { useMemo } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { ApiError, fetchCourses, fetchMe, fetchPlan, fetchRequirements, logIn, logOut, savePlan, signUp } from './api';
import type { LoadedPlan, SignUp, Student } from './api';
import { Catalog } from './Catalog';
import type { DegreePlan } from './DegreePlan';

// Loading and errors are handled by <Suspense> and <ErrorBoundary> in App.

const meKey = ['me'];
const coursesQuery = queryOptions({ queryKey: ['courses'], queryFn: () => fetchCourses() });
const requirementsQuery = queryOptions({ queryKey: ['requirements'], queryFn: () => fetchRequirements() });
// Keyed by student, so logging in as someone else never shows the last student's plan.
const planKey = (student: Student | null) => ['plan', student?.email ?? null];

// A 401 from any route means the session ended (it expired, or the student logged out in
// another tab), so the app goes back to the login page.
export function createQueryClient(options: { retry?: number } = {}) {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      // Data only changes when this app saves it, so it never goes stale.
      queries: { staleTime: Infinity, retry: (failures, error) => !isLoggedOut(error) && failures < (options.retry ?? 1) },
    },
    queryCache: new QueryCache({ onError: (error) => endSessionIf401(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => endSessionIf401(client, error) }),
  });
  return client;
}

function isLoggedOut(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function endSessionIf401(client: QueryClient, error: unknown) {
  if (isLoggedOut(error)) endSession(client);
}

function endSession(client: QueryClient) {
  client.setQueryData<Student | null>(meKey, null);
  client.removeQueries({ queryKey: ['plan'] });
}

// The logged-in student, or null.
export function useMe() {
  return useSuspenseQuery({ queryKey: meKey, queryFn: () => fetchMe() }).data;
}

function useStartSession() {
  const queryClient = useQueryClient();
  return (student: Student) => {
    queryClient.removeQueries({ queryKey: ['plan'] });
    queryClient.setQueryData<Student | null>(meKey, student);
  };
}

export function useLogIn() {
  const startSession = useStartSession();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => logIn(email, password),
    onSuccess: startSession,
  });
}

export function useSignUp() {
  const startSession = useStartSession();
  return useMutation({ mutationFn: (details: SignUp) => signUp(details), onSuccess: startSession });
}

export function useLogOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logOut(),
    onSuccess: () => endSession(queryClient),
  });
}

export function useCourses() {
  return useSuspenseQuery(coursesQuery).data;
}

export function useRequirements() {
  return useSuspenseQuery(requirementsQuery).data;
}

export function useCatalog() {
  const courses = useCourses();
  const requirements = useRequirements();
  return useMemo(() => new Catalog(courses, requirements), [courses, requirements]);
}

// The plan only accepts courses the server offers, so it loads after the courses.
export function useSavedPlan() {
  const courses = useCourses();
  const student = useMe();
  return useSuspenseQuery({ queryKey: planKey(student), queryFn: () => fetchPlan(courses) }).data;
}

export function useSavePlan() {
  const queryClient = useQueryClient();
  const student = useMe();
  return useMutation({
    mutationFn: (plan: DegreePlan) => savePlan(plan),
    onSuccess: (lastSaved, plan) => {
      queryClient.setQueryData<LoadedPlan>(planKey(student), { plan, lastSaved });
    },
  });
}

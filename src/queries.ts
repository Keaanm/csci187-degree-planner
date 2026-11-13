import { useMemo } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  ApiError,
  createPlan,
  deletePlan,
  fetchCourses,
  fetchMe,
  fetchPlan,
  fetchPlans,
  fetchRequirements,
  logIn,
  logOut,
  renamePlan,
  savePlan,
  signUp,
} from './api';
import type { LoadedPlan, PlanInfo, SignUp, Student } from './api';
import { Catalog } from './Catalog';
import type { DegreePlan } from './DegreePlan';

// Loading and errors are handled by <Suspense> and <ErrorBoundary> in App.

const meKey = ['me'];
// Why the last session ended: the student logged out, or it expired (a 401). Only the
// login page reads it, to explain why the student is there.
const sessionEndKey = ['sessionEnd'];
export type SessionEnd = 'loggedOut' | 'expired' | null;
const coursesQuery = queryOptions({ queryKey: ['courses'], queryFn: () => fetchCourses() });
const requirementsQuery = queryOptions({ queryKey: ['requirements'], queryFn: () => fetchRequirements() });
// Keyed by student, so logging in as someone else never shows the last student's plans.
// Every key starts with 'plan', so ending a session removes them all.
const planListKey = (student: Student | null) => ['plan', student?.email ?? null, 'list'];
const planKey = (student: Student | null, planId: number) => ['plan', student?.email ?? null, planId];

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
  // Only a session that was open can expire; a 401 from logging in is a wrong password.
  if (isLoggedOut(error) && client.getQueryData(meKey)) endSession(client, 'expired');
}

function endSession(client: QueryClient, reason: SessionEnd) {
  client.setQueryData<SessionEnd>(sessionEndKey, reason);
  client.setQueryData<Student | null>(meKey, null);
  client.removeQueries({ queryKey: ['plan'] });
}

// The logged-in student, or null.
export function useMe() {
  return useSuspenseQuery({ queryKey: meKey, queryFn: () => fetchMe() }).data;
}

export function useSessionEnd(): SessionEnd {
  return useQuery({ queryKey: sessionEndKey, queryFn: () => null, initialData: null, staleTime: Infinity }).data;
}

function useStartSession() {
  const queryClient = useQueryClient();
  return (student: Student) => {
    queryClient.removeQueries({ queryKey: ['plan'] });
    queryClient.setQueryData<SessionEnd>(sessionEndKey, null);
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
    onSuccess: () => endSession(queryClient, 'loggedOut'),
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

// The student's plans, oldest first. Never empty.
export function usePlanList() {
  const student = useMe();
  return useSuspenseQuery({ queryKey: planListKey(student), queryFn: () => fetchPlans() }).data;
}

// Changes one plan in the list, or removes it when `change` returns null.
function useUpdatePlanList() {
  const queryClient = useQueryClient();
  const student = useMe();
  return (planId: number, change: (plan: PlanInfo) => PlanInfo | null) =>
    queryClient.setQueryData<PlanInfo[]>(planListKey(student), (plans) =>
      plans?.flatMap((p) => {
        if (p.planId !== planId) return [p];
        const changed = change(p);
        return changed ? [changed] : [];
      }),
    );
}

// The plan only accepts courses the server offers, so it loads after the courses.
export function useSavedPlan(planId: number) {
  const courses = useCourses();
  const student = useMe();
  return useSuspenseQuery({ queryKey: planKey(student, planId), queryFn: () => fetchPlan(planId, courses) }).data;
}

export function useSavePlan(planId: number) {
  const queryClient = useQueryClient();
  const student = useMe();
  const updatePlanList = useUpdatePlanList();
  return useMutation({
    mutationFn: (plan: DegreePlan) => savePlan(planId, plan),
    onSuccess: (lastSaved, plan) => {
      queryClient.setQueryData<LoadedPlan>(planKey(student, planId), { plan, lastSaved });
      updatePlanList(planId, (p) => ({ ...p, lastSaved }));
    },
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  const student = useMe();
  return useMutation({
    mutationFn: (details: { name: string; copyFrom?: number }) => createPlan(details),
    onSuccess: (created) => {
      queryClient.setQueryData<PlanInfo[]>(planListKey(student), (plans) => [...(plans ?? []), created]);
    },
  });
}

export function useRenamePlan() {
  const updatePlanList = useUpdatePlanList();
  return useMutation({
    mutationFn: ({ planId, name }: { planId: number; name: string }) => renamePlan(planId, name),
    onSuccess: (renamed) => updatePlanList(renamed.planId, () => renamed),
  });
}

// The deleted plan's courses stay cached until the session ends: removing them while the
// plan is still on screen would refetch it and get a 404.
export function useDeletePlan() {
  const updatePlanList = useUpdatePlanList();
  return useMutation({
    mutationFn: (planId: number) => deletePlan(planId),
    onSuccess: (_, planId) => updatePlanList(planId, () => null),
  });
}

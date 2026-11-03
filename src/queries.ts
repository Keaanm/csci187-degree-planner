import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { PLAN_ID, fetchCourses, fetchPlan, fetchRequirements, savePlan } from './api';
import type { LoadedPlan } from './api';
import type { DegreePlan } from './DegreePlan';

// Loading and errors are handled by <Suspense> and <ErrorBoundary> in App.

const coursesQuery = queryOptions({ queryKey: ['courses'], queryFn: () => fetchCourses() });
const requirementsQuery = queryOptions({ queryKey: ['requirements'], queryFn: () => fetchRequirements() });
const planKey = ['plans', PLAN_ID];

export function useCourses() {
  return useSuspenseQuery(coursesQuery).data;
}

export function useRequirements() {
  return useSuspenseQuery(requirementsQuery).data;
}

// The plan only accepts courses the server offers, so it loads after the courses.
export function useSavedPlan() {
  const courses = useCourses();
  return useSuspenseQuery({ queryKey: planKey, queryFn: () => fetchPlan(courses, PLAN_ID) }).data;
}

export function useSavePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: DegreePlan) => savePlan(plan, PLAN_ID),
    onSuccess: (lastSaved, plan) => {
      queryClient.setQueryData<LoadedPlan>(planKey, { plan, lastSaved });
    },
  });
}

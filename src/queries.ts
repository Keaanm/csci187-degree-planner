import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { PLAN_ID, fetchCourses, fetchPlan, fetchRequirements, savePlan } from './api';
import type { LoadedPlan } from './api';
import type { DegreePlan } from './DegreePlan';

// TanStack Query wrappers around the API. The suspense hooks always return loaded data;
// the <Suspense> and <ErrorBoundary> in App show loading and error states.

const coursesQuery = queryOptions({ queryKey: ['courses'], queryFn: () => fetchCourses() });
const requirementsQuery = queryOptions({ queryKey: ['requirements'], queryFn: () => fetchRequirements() });
const planQuery = queryOptions({ queryKey: ['plans', PLAN_ID], queryFn: () => fetchPlan(PLAN_ID) });

export function useCourses() {
  return useSuspenseQuery(coursesQuery).data;
}

export function useRequirements() {
  return useSuspenseQuery(requirementsQuery).data;
}

export function useSavedPlan() {
  return useSuspenseQuery(planQuery).data;
}

// Saves the plan and updates the cached saved plan with the new last-saved time.
export function useSavePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: DegreePlan) => savePlan(plan, PLAN_ID),
    onSuccess: (lastSaved, plan) => {
      queryClient.setQueryData<LoadedPlan>(planQuery.queryKey, { plan, lastSaved });
    },
  });
}

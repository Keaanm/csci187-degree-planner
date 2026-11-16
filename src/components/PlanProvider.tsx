import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DegreePlan } from '@/DegreePlan';
import { PlanContext } from '@/PlanContext';
import { useSavePlan, useSavedPlan } from '@/queries';

export const AUTOSAVE_DELAY_MS = 1000;

// One plan's courses. Edits stay in a draft until they are saved automatically, once the
// student stops editing for `autosaveDelay` ms.
export default function PlanProvider({ planId, children, autosaveDelay = AUTOSAVE_DELAY_MS }: {
  planId: number;
  children: ReactNode;
  autosaveDelay?: number;
}) {
  const { plan: savedPlan, lastSaved } = useSavedPlan(planId);
  const [draft, setDraft] = useState<DegreePlan | null>(null);
  const { mutate, isPending, isError, variables, error } = useSavePlan(planId);
  const plan = draft ?? savedPlan;
  // Undoing every edit counts as saved.
  const saved = draft === null || draft.sameAs(savedPlan);
  const failed = isError && variables === plan;

  const save = useCallback(
    (toSave: DegreePlan) => {
      // Keep edits made while the save was in flight.
      mutate(toSave, { onSuccess: (_, savedNow) => setDraft((d) => (d === savedNow ? null : d)) });
    },
    [mutate],
  );

  useEffect(() => {
    if (saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saved]);

  // One save at a time, so saves can't arrive out of order. A plan that failed to save
  // waits for the next edit or "Try again" instead of retrying in a loop.
  useEffect(() => {
    if (saved || isPending || failed) return;
    const timer = setTimeout(() => save(plan), autosaveDelay);
    return () => clearTimeout(timer);
  }, [plan, saved, isPending, failed, autosaveDelay, save]);

  return (
    <PlanContext.Provider
      value={{
        plan,
        saved,
        lastSaved,
        changePlan: setDraft,
        retrySave: () => save(plan),
        saving: isPending,
        // Only for the plan that failed to save, so any edit clears it.
        saveError: failed ? (error?.message ?? '') : '',
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DegreePlan } from '@/DegreePlan';
import { PlanContext } from '@/PlanContext';
import { useSavePlan, useSavedPlan } from '@/queries';

// Edits stay in a draft until the student saves.
export default function PlanProvider({ children }: { children: ReactNode }) {
  const { plan: savedPlan, lastSaved } = useSavedPlan();
  const [draft, setDraft] = useState<DegreePlan | null>(null);
  const savePlan = useSavePlan();
  const plan = draft ?? savedPlan;
  const saved = draft === null;

  useEffect(() => {
    if (saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saved]);

  function save() {
    // Keep edits made while the save was in flight.
    savePlan.mutate(plan, { onSuccess: (_, savedNow) => setDraft((d) => (d === savedNow ? null : d)) });
  }

  return (
    <PlanContext.Provider
      value={{
        plan,
        saved,
        lastSaved,
        changePlan: setDraft,
        save,
        saving: savePlan.isPending,
        saveError: savePlan.error?.message ?? '',
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}

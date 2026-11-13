import { useCallback, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import type { Student } from '@/api';
import PlanProvider from '@/components/PlanProvider';
import { PlansContext } from '@/PlansContext';
import { usePlanList } from '@/queries';

// The student's plans and which one is open. The open plan is remembered in this browser,
// so a reload opens the same one. Opening another plan remounts PlanProvider, so no draft
// carries over from one plan to the next.
export default function PlansProvider({ student, children, autosaveDelay }: {
  student: Student;
  children: ReactNode;
  autosaveDelay?: number;
}) {
  const plans = usePlanList();
  const [chosen, setChosen] = useState<number | null>(() => rememberedPlan(student.email));
  const [opening, startOpening] = useTransition();
  // A deleted (or someone else's remembered) plan falls back to the oldest one.
  const planId = plans.some((p) => p.planId === chosen) ? (chosen as number) : plans[0].planId;

  const selectPlan = useCallback(
    (id: number) => {
      // A transition keeps the open plan on screen while the next one loads.
      startOpening(() => setChosen(id));
      rememberPlan(student.email, id);
    },
    [student.email],
  );

  return (
    <PlansContext.Provider value={{ plans, planId, selectPlan, opening }}>
      <PlanProvider key={planId} planId={planId} autosaveDelay={autosaveDelay}>
        {children}
      </PlanProvider>
    </PlansContext.Provider>
  );
}

// Browser storage can be missing or blocked (a private window), so it's only a convenience.
const storageKey = (email: string) => `degreePlanner.openPlan.${email}`;

function rememberedPlan(email: string): number | null {
  try {
    const value = Number(localStorage.getItem(storageKey(email)));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberPlan(email: string, planId: number) {
  try {
    localStorage.setItem(storageKey(email), String(planId));
  } catch {
    // Not remembered; the oldest plan opens next time.
  }
}

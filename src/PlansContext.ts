import { createContext, useContext } from 'react';
import type { PlanInfo } from './api';

interface PlansState {
  // The student's plans, oldest first. Never empty.
  plans: PlanInfo[];
  // The plan that's open.
  planId: number;
  // Opens another plan. Unsaved changes to the open plan are lost, so callers wait until
  // it's saved (see PlanSwitcher).
  selectPlan: (planId: number) => void;
  // True while the plan being opened loads. The open plan stays on screen until then.
  opening: boolean;
}

export const PlansContext = createContext<PlansState | null>(null);

export function usePlans(): PlansState {
  const state = useContext(PlansContext);
  if (!state) throw new Error('usePlans must be used inside PlansProvider');
  return state;
}

import { createContext, useContext } from 'react';
import type { DegreePlan } from './DegreePlan';

export interface PlanState {
  // The plan with any unsaved changes.
  plan: DegreePlan;
  saved: boolean;
  lastSaved: string | null;
  changePlan: (plan: DegreePlan) => void;
  save: () => void;
  saving: boolean;
  saveError: string;
}

export const PlanContext = createContext<PlanState | null>(null);

export function usePlan(): PlanState {
  const state = useContext(PlanContext);
  if (!state) throw new Error('usePlan must be used inside PlanProvider');
  return state;
}

import { DegreePlan } from './DegreePlan';

const STORAGE_KEY = 'degreePlan';

// Saves and loads the plan in the browser (localStorage). There are no accounts in the MVP.
export function savePlan(plan: DegreePlan, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(plan.toJSON()));
}

export function loadPlan(storage: Storage = localStorage): DegreePlan {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return saved ? DegreePlan.fromJSON(JSON.parse(saved)) : new DegreePlan();
  } catch {
    return new DegreePlan();
  }
}

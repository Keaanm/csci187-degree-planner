import PlanSummary from '@/components/PlanSummary';
import RequirementsPanel from '@/components/RequirementsPanel';
import SaveStatus from '@/components/SaveStatus';
import YearRow from '@/components/YearRow';
import { YEARS } from '@/DegreePlan';

export default function PlanPage() {
  return (
    <div className="space-y-6">
      {/* Sticky so the save status stays in view while scrolling the plan. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-6 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-2xl font-semibold">My Plan</h1>
        <SaveStatus />
      </div>
      <PlanSummary />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          {Array.from({ length: YEARS }, (_, year) => (
            <YearRow key={year} year={year} />
          ))}
        </div>
        <RequirementsPanel />
      </div>
    </div>
  );
}

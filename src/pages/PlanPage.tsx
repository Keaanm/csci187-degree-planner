import PlanSummary from '@/components/PlanSummary';
import RequirementsPanel from '@/components/RequirementsPanel';
import SaveBar from '@/components/SaveBar';
import YearRow from '@/components/YearRow';
import { YEARS } from '@/DegreePlan';

export default function PlanPage() {
  return (
    <div className="space-y-6">
      {/* Sticky so Save stays in reach while scrolling the plan. */}
      <div className="sticky top-0 z-10 -my-3 flex flex-wrap items-center justify-between gap-3 bg-background py-3">
        <h1 className="text-2xl font-semibold">My Plan</h1>
        <SaveBar />
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

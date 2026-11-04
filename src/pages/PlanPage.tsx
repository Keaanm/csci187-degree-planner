import PlanSummary from '@/components/PlanSummary';
import RequirementsPanel from '@/components/RequirementsPanel';
import YearRow from '@/components/YearRow';
import { YEARS } from '@/DegreePlan';

export default function PlanPage() {
  return (
    <div className="space-y-6">
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

import QuarterCard from '@/components/QuarterCard';
import { TERMS } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';

export default function YearRow({ year }: { year: number }) {
  const { plan } = usePlan();
  const quarters = TERMS.map((_, term) => year * TERMS.length + term);
  const warnings = plan.prerequisiteWarnings();
  const units = quarters.reduce((sum, q) => sum + plan.unitsIn(q), 0);

  return (
    <section aria-labelledby={`year-${year + 1}`} className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id={`year-${year + 1}`} className="text-lg font-semibold">
          Year {year + 1}
        </h2>
        <span className="text-sm text-muted-foreground">{units} units</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {quarters.map((q) => (
          <QuarterCard key={q} quarter={q} warnings={warnings} />
        ))}
      </div>
    </section>
  );
}

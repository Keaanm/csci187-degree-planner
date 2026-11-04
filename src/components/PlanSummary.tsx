import { Card, CardContent } from '@/components/ui/card';
import { UNITS_TO_GRADUATE } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';
import { useRequirements } from '@/queries';

const percent = (units: number) => `${Math.min(100, (units / UNITS_TO_GRADUATE) * 100)}%`;

export default function PlanSummary() {
  const requirements = useRequirements();
  const { plan } = usePlan();
  const completedUnits = plan.completedUnits();
  const plannedUnits = plan.totalUnits() - completedUnits;
  const unplannedUnits = Math.max(0, UNITS_TO_GRADUATE - plan.totalUnits());
  const progress = plan.requirementProgress(requirements);
  const completed = progress.filter((r) => r.state === 'completed').length;
  const covered = progress.filter((r) => r.state === 'planned').length;

  return (
    <Card className="gap-4">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">My Plan</h1>
          <p className="text-sm">
            {completed} of {progress.length} requirements completed
            {covered > 0 && <span className="text-muted-foreground">, {covered} more covered by your plan</span>}
          </p>
        </div>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${completedUnits} units completed and ${plannedUnits} planned, of ${UNITS_TO_GRADUATE}`}
        >
          <div className="bg-primary" style={{ width: percent(completedUnits) }} />
          <div className="bg-primary/35" style={{ width: percent(plannedUnits) }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" /> {completedUnits} units completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary/35" /> {plannedUnits} planned
          </span>
          <span>
            {unplannedUnits} not planned yet, of {UNITS_TO_GRADUATE} to graduate
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {plan.courseCodes().length === 0 && 'Start by adding the courses you have already taken. '}
          Click the circle next to a course to mark it completed.
        </p>
      </CardContent>
    </Card>
  );
}

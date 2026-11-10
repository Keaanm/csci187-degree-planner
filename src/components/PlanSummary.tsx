import { Card, CardContent } from '@/components/ui/card';
import { usePlan } from '@/PlanContext';
import { useRequirements } from '@/queries';

export default function PlanSummary() {
  const requirements = useRequirements();
  const { plan } = usePlan();
  const units = plan.requirementUnits(requirements);
  const unplanned = units.needed - units.completed - units.planned;
  const percent = (n: number) => `${(n / units.needed) * 100}%`;
  const progress = plan.requirementProgress(requirements);
  const completed = progress.filter((r) => r.state === 'completed').length;
  const covered = progress.filter((r) => r.state === 'planned').length;

  return (
    <Card className="gap-4">
      <CardContent className="space-y-4">
        <p className="text-sm">
          {completed} of {progress.length} requirements completed
          {covered > 0 && <span className="text-muted-foreground">, {covered} more covered by your plan</span>}
        </p>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${units.completed} units completed and ${units.planned} planned, of ${units.needed}`}
        >
          <div className="bg-primary" style={{ width: percent(units.completed) }} />
          <div className="bg-primary/35" style={{ width: percent(units.planned) }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" /> {units.completed} units completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary/35" /> {units.planned} planned
          </span>
          <span>
            {unplanned} not planned yet, of the {units.needed} units these requirements need
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

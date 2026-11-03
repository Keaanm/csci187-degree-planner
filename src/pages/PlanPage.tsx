import QuarterCard from '@/components/QuarterCard';
import RequirementList from '@/components/RequirementList';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QUARTER_COUNT } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';
import { useRequirements } from '@/queries';

export default function PlanPage() {
  const requirements = useRequirements();
  const { plan } = usePlan();
  const warnings = plan.prerequisiteWarnings();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">4-Year Plan</h1>
        <div className="flex gap-2">
          <Badge variant="secondary">{plan.totalUnits()} units planned</Badge>
          <Badge variant="secondary">{plan.completedUnits()} completed</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>Which degree requirements the courses in your plan satisfy.</CardDescription>
        </CardHeader>
        <CardContent>
          <RequirementList statuses={plan.requirementStatus(requirements)} metBy="Satisfied by your plan" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: QUARTER_COUNT }, (_, q) => (
          <QuarterCard key={q} quarter={q} warnings={warnings} />
        ))}
      </div>
    </div>
  );
}

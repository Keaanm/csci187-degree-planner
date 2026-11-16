import EmphasisPicker from '@/components/EmphasisPicker';
import RequirementItem from '@/components/RequirementItem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlan } from '@/PlanContext';
import { usePlanRequirements } from '@/queries';

export default function RequirementsPanel() {
  const requirements = usePlanRequirements();
  const { plan } = usePlan();

  return (
    <Card className="gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <CardHeader>
        <CardTitle>Requirements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <EmphasisPicker />
        <p className="text-sm text-muted-foreground">
          University Core requirements aren't checked yet. They'll be met with Core, AP and transfer credit, which is
          coming soon.
        </p>
        <ul className="space-y-4">
          {plan.requirementProgress(requirements).map((progress) => (
            <RequirementItem key={progress.requirement.description} progress={progress} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

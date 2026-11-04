import RequirementItem from '@/components/RequirementItem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlan } from '@/PlanContext';
import { useRequirements } from '@/queries';

export default function RequirementsPanel() {
  const requirements = useRequirements();
  const { plan } = usePlan();

  return (
    <Card className="gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <CardHeader>
        <CardTitle>Requirements</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {plan.requirementProgress(requirements).map((progress) => (
            <RequirementItem key={progress.requirement.description} progress={progress} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

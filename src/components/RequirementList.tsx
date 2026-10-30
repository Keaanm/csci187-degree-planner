import { CircleCheck, Circle } from 'lucide-react';
import StillNeeded from '@/components/StillNeeded';
import type { RequirementStatus } from '@/DegreePlan';

// Lists degree requirements with a check mark when met, or what is still needed.
export default function RequirementList({ statuses, metBy }: { statuses: RequirementStatus[]; metBy: string }) {
  return (
    <ul className="space-y-3">
      {statuses.map(({ requirement, satisfied, stillNeeded, missing }) => (
        <li key={requirement.description} className="flex gap-2">
          {satisfied ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Met" />
          ) : (
            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not met" />
          )}
          <div>
            <div className="font-medium">{requirement.description}</div>
            <div className="text-sm text-muted-foreground">
              {satisfied ? metBy : <StillNeeded stillNeeded={stillNeeded} missing={missing} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

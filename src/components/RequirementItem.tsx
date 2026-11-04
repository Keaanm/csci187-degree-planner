import { Circle, CircleCheck, CircleDashed } from 'lucide-react';
import AddToPlan from '@/components/AddToPlan';
import CourseLink from '@/components/CourseLink';
import type { RequirementProgress } from '@/DegreePlan';

const icons = {
  completed: <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Completed" />,
  planned: <CircleDashed className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Covered by your plan" />,
  missing: <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not covered" />,
};

export default function RequirementItem({ progress }: { progress: RequirementProgress }) {
  const { requirement, state, stillNeeded, missing } = progress;

  return (
    <li className="flex gap-2 text-sm">
      {icons[state]}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{requirement.description}</div>
        {state === 'completed' && <div className="text-muted-foreground">Completed</div>}
        {state === 'planned' && <div className="text-muted-foreground">Covered by your plan</div>}
        {state === 'missing' && (
          <>
            <div className="text-muted-foreground">
              Add {stillNeeded === missing.length ? '' : `${stillNeeded} of `}
              {stillNeeded === 1 && missing.length === 1 ? 'this course' : 'these courses'}:
            </div>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {missing.map((code) => (
                <li key={code} className="flex items-center rounded-md border pl-2 text-xs">
                  <CourseLink code={code} />
                  <AddToPlan code={code} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </li>
  );
}

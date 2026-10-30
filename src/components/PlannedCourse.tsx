import { TriangleAlert, X } from 'lucide-react';
import CourseLink from '@/components/CourseLink';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Course } from '@/Course';
import type { PrerequisiteWarning } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';

// One course in a quarter: remove button, "Completed" checkbox and any prerequisite warning.
export default function PlannedCourse({ course, quarter, warning }: {
  course: Course;
  quarter: number;
  warning?: PrerequisiteWarning;
}) {
  const { plan, changePlan } = usePlan();
  const checkboxId = `completed-${course.code}`;

  function setCompleted(completed: boolean) {
    changePlan(completed ? plan.markCompleted(course.code) : plan.markPlanned(course.code));
  }

  return (
    <li className="rounded-md border p-2 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CourseLink code={course.code} /> <span className="text-muted-foreground">({course.units})</span>
          <div className="truncate text-muted-foreground">{course.title}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => changePlan(plan.removeCourse(quarter, course.code))}
          aria-label={`Remove ${course.code}`}
        >
          <X />
        </Button>
      </div>
      <label htmlFor={checkboxId} className="mt-1 flex items-center gap-2 text-muted-foreground">
        <Checkbox
          id={checkboxId}
          checked={plan.isCompleted(course.code)}
          onCheckedChange={(checked) => setCompleted(checked === true)}
        />
        Completed
      </label>
      {warning && (
        <p className="mt-1 flex gap-1 text-amber-700 dark:text-amber-500" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Take {warning.missing.map((group) => group.join(' or ')).join(', and ')} in an earlier quarter first
        </p>
      )}
    </li>
  );
}

import { Circle, CircleCheck, TriangleAlert, X } from 'lucide-react';
import CourseLink from '@/components/CourseLink';
import { Button } from '@/components/ui/button';
import type { Course } from '@/Course';
import type { PrerequisiteWarning } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';

export default function PlannedCourse({ course, quarter, warning }: {
  course: Course;
  quarter: number;
  warning?: PrerequisiteWarning;
}) {
  const { plan, changePlan } = usePlan();
  const completed = plan.isCompleted(course.code);

  return (
    <li className="flex items-start gap-2 rounded-md border p-2 text-sm">
      <button
        type="button"
        className="mt-0.5 shrink-0 rounded-full"
        aria-pressed={completed}
        aria-label={`${course.code} completed`}
        title={completed ? 'Completed. Click to mark as planned.' : 'Planned. Click to mark as completed.'}
        onClick={() => changePlan(completed ? plan.markPlanned(course.code) : plan.markCompleted(course.code))}
      >
        {completed ? (
          <CircleCheck className="size-4 text-green-600" />
        ) : (
          <Circle className="size-4 text-muted-foreground hover:text-foreground" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <CourseLink code={course.code} /> <span className="text-xs text-muted-foreground">{course.units}u</span>
        <div className="truncate text-xs text-muted-foreground" title={course.title}>
          {course.title}
        </div>
        {warning && (
          <p className="mt-1 flex gap-1 text-xs text-amber-700 dark:text-amber-500" role="alert">
            <TriangleAlert className="size-3.5 shrink-0" />
            Take {warning.missing.map((group) => group.join(' or ')).join(', and ')} in an earlier quarter first
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-5"
        onClick={() => changePlan(plan.removeCourse(quarter, course.code))}
        aria-label={`Remove ${course.code}`}
      >
        <X />
      </Button>
    </li>
  );
}

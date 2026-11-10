import { useState } from 'react';
import CoursePicker from '@/components/CoursePicker';
import PlannedCourse from '@/components/PlannedCourse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MAX_UNITS_PER_QUARTER, TERMS, quarterLabel } from '@/DegreePlan';
import type { DegreePlan, PrerequisiteWarning } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';
import { useCourses } from '@/queries';

export default function QuarterCard({ quarter, warnings }: { quarter: number; warnings: PrerequisiteWarning[] }) {
  const courses = useCourses();
  const { plan, changePlan } = usePlan();
  // The error belongs to the plan it happened on, so any later change clears it.
  const [error, setError] = useState<{ plan: DegreePlan; message: string } | null>(null);
  const available = courses.filter((c) => !plan.hasCourse(c.code));

  function add(code: string) {
    try {
      changePlan(plan.addCourse(quarter, code));
    } catch (e) {
      setError({ plan, message: (e as Error).message });
    }
  }

  return (
    <Card className="gap-3 py-3">
      <CardHeader className="flex items-baseline justify-between px-3">
        <CardTitle className="text-sm">{TERMS[quarter % TERMS.length]}</CardTitle>
        <CardDescription className="text-xs">
          {plan.unitsIn(quarter)}/{MAX_UNITS_PER_QUARTER} units
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 px-3">
        <ul className="space-y-1.5">
          {plan.coursesIn(quarter).map((c) => (
            <PlannedCourse
              key={c.code}
              course={c}
              quarter={quarter}
              warning={warnings.find((w) => w.course.code === c.code)}
            />
          ))}
        </ul>
        {/* mt-auto lines the pickers up across a row. */}
        <div className="mt-auto space-y-2">
          <CoursePicker courses={available} label={`Add a course to ${quarterLabel(quarter)}`} onPick={add} />
          {error?.plan === plan && (
            <p className="text-xs text-destructive" role="alert">
              {error.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

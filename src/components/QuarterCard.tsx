import { useState } from 'react';
import CoursePicker from '@/components/CoursePicker';
import PlannedCourse from '@/components/PlannedCourse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MAX_UNITS_PER_QUARTER, quarterLabel } from '@/DegreePlan';
import type { PrerequisiteWarning } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';
import { useCourses } from '@/queries';

export default function QuarterCard({ quarter, warnings }: { quarter: number; warnings: PrerequisiteWarning[] }) {
  const courses = useCourses();
  const { plan, changePlan } = usePlan();
  const [error, setError] = useState('');
  const available = courses.filter((c) => !plan.hasCourse(c.code));
  const label = quarterLabel(quarter);

  function add(code: string) {
    try {
      changePlan(plan.addCourse(quarter, code));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>
          {plan.unitsIn(quarter)}/{MAX_UNITS_PER_QUARTER} units
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-4">
        <ul className="space-y-2">
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
          <CoursePicker courses={available} label={`Add a course to ${label}`} onPick={add} />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

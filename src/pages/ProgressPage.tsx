import { Link } from 'react-router';
import CourseLink from '@/components/CourseLink';
import RequirementList from '@/components/RequirementList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { UNITS_TO_GRADUATE, quarterLabel } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';
import { useRequirements } from '@/queries';

// Degree progress, counting only courses marked completed.
export default function ProgressPage() {
  const requirements = useRequirements();
  const { plan } = usePlan();
  const statuses = plan.completedRequirementStatus(requirements);
  const met = statuses.filter((s) => s.satisfied);
  const remaining = statuses.filter((s) => !s.satisfied);
  const completedUnits = plan.completedUnits();
  const completedCourses = plan.quarters.flatMap((courses, quarter) =>
    courses.filter((c) => plan.isCompleted(c.code)).map((course) => ({ course, quarter })),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Degree Progress</h1>

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
          <CardDescription>
            {completedUnits} of {UNITS_TO_GRADUATE} units completed, {plan.remainingUnits()} remaining
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress
            value={Math.min(100, (completedUnits / UNITS_TO_GRADUATE) * 100)}
            aria-label="Units completed"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Remaining requirements ({remaining.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {remaining.length > 0 ? (
              <RequirementList statuses={remaining} metBy="" />
            ) : (
              <p className="text-sm text-muted-foreground">You've completed every requirement.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed requirements ({met.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {met.length > 0 ? (
              <RequirementList statuses={met} metBy="Completed" />
            ) : (
              <p className="text-sm text-muted-foreground">No requirements completed yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed courses ({completedCourses.length})</CardTitle>
          <CardDescription>
            To record a completed course, add it to a quarter in your{' '}
            <Link to="/plan" className="underline underline-offset-2">
              4-year plan
            </Link>{' '}
            and check "Completed".
          </CardDescription>
        </CardHeader>
        {completedCourses.length > 0 && (
          <CardContent>
            <ul className="divide-y text-sm">
              {completedCourses.map(({ course, quarter }) => (
                <li key={course.code} className="flex justify-between gap-4 py-2">
                  <span>
                    <CourseLink code={course.code} /> {course.title}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {quarterLabel(quarter)} · {course.units} units
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

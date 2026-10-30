import { useParams } from 'react-router';
import BackLink from '@/components/BackLink';
import CourseLink from '@/components/CourseLink';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { quarterLabel } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';
import { useCourses, useRequirements } from '@/queries';

// Course detail: description, prerequisites, and the requirements the course satisfies.
export default function CoursePage() {
  const { code = '' } = useParams();
  const courses = useCourses();
  const requirements = useRequirements();
  const { plan } = usePlan();
  const course = courses.find((c) => c.code === code);

  if (!course) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p>No offered course has the code {code}.</p>
      </div>
    );
  }

  const satisfies = requirements.filter((r) => r.courses.includes(course.code));
  const requiredBy = courses.filter((c) => c.prerequisites.some((group) => group.includes(course.code)));
  const quarter = plan.quarters.findIndex((q) => q.some((c) => c.code === course.code));

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <h1 className="text-2xl font-semibold">
          {course.code}: {course.title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="secondary">{course.units} units</Badge>
          {quarter >= 0 && (
            <Badge>
              {plan.isCompleted(course.code) ? 'Completed' : 'Planned'} in {quarterLabel(quarter)}
            </Badge>
          )}
        </div>
      </div>
      <p className="max-w-prose">{course.description}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prerequisites</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {course.prerequisites.length === 0 ? (
              <p className="text-muted-foreground">None</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {course.prerequisites.map((group) => (
                  <li key={group.join()}>
                    {group.map((p, i) => (
                      <span key={p}>
                        {i > 0 && ' or '}
                        <CourseLink code={p} />
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Satisfies</CardTitle>
            <CardDescription>Degree requirements this course counts toward.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {satisfies.length === 0 ? (
              <p className="text-muted-foreground">No requirements in the Software emphasis</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {satisfies.map((r) => (
                  <li key={r.description}>{r.description}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {requiredBy.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Prerequisite for{' '}
          {requiredBy.map((c, i) => (
            <span key={c.code}>
              {i > 0 && ', '}
              <CourseLink code={c.code} />
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

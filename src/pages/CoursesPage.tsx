import { Link, useLocation, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePlan } from '@/PlanContext';
import { useCatalog } from '@/queries';

export default function CoursesPage() {
  const catalog = useCatalog();
  const { plan } = usePlan();
  // The search is in the URL so "All courses" on a course page can come back to it.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const location = useLocation();
  const matches = catalog.search(search);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Course Lookup</h1>
      <Input
        type="search"
        placeholder="Search by code, title or description, e.g. CSCI 61 or data structures"
        value={search}
        onChange={(e) => setSearchParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        aria-label="Search courses"
        className="max-w-xl"
      />
      <p className="text-sm text-muted-foreground">
        {matches.length} of {catalog.courses.length} courses
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((c) => (
          <Link
            key={c.code}
            to={`/courses/${encodeURIComponent(c.code)}`}
            state={{ backTo: location.pathname + location.search }}
            className="rounded-xl"
          >
            <Card className="h-full gap-2 transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  {c.code}
                  {plan.isCompleted(c.code) ? (
                    <Badge>Completed</Badge>
                  ) : (
                    plan.hasCourse(c.code) && <Badge variant="secondary">In plan</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {c.title} · {c.units} units
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

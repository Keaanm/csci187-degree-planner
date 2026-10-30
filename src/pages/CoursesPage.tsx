import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePlan } from '@/PlanContext';
import { useCourses } from '@/queries';

// Course lookup: search the offered courses by code, title or description.
export default function CoursesPage() {
  const courses = useCourses();
  const { plan } = usePlan();
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const matches = courses.filter((c) =>
    [c.code, c.title, c.description].some((text) => text.toLowerCase().includes(term)),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Course Lookup</h1>
      <Input
        type="search"
        placeholder="Search by code, title or description, e.g. CSCI 61 or data structures"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search courses"
        className="max-w-xl"
      />
      <p className="text-sm text-muted-foreground">
        {matches.length} of {courses.length} courses
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((c) => (
          <Link key={c.code} to={`/courses/${encodeURIComponent(c.code)}`} className="rounded-xl">
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

import { Link } from 'react-router';

// Link to a course's detail page.
export default function CourseLink({ code }: { code: string }) {
  return (
    <Link to={`/courses/${encodeURIComponent(code)}`} className="underline underline-offset-2 hover:text-foreground">
      {code}
    </Link>
  );
}

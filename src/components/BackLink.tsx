import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router';

// Back to the course lookup, with the search the student came from.
export default function BackLink() {
  const backTo = (useLocation().state as { backTo?: string } | null)?.backTo ?? '/courses';
  return (
    <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> All courses
    </Link>
  );
}

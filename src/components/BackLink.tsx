import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

// Link back to the course lookup page.
export default function BackLink() {
  return (
    <Link to="/courses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> All courses
    </Link>
  );
}

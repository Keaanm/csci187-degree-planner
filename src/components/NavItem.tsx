import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

// A link in the top navigation, bold when its page is open.
export default function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn('text-sm text-muted-foreground hover:text-foreground', isActive && 'font-medium text-foreground')
      }
    >
      {children}
    </NavLink>
  );
}

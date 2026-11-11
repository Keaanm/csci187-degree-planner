import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import AuthCard from '@/components/AuthCard';
import Field from '@/components/Field';
import { Input } from '@/components/ui/input';
import { useLogIn, useSessionEnd } from '@/queries';

export default function LogInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const logIn = useLogIn();
  const sessionEnd = useSessionEnd();
  // Kept when switching to sign-up, so either way the student returns to the page they asked for.
  const { state } = useLocation();

  return (
    <AuthCard
      title="Log in"
      description="Pick up your 4-year plan where you left off."
      notice={
        sessionEnd === 'expired'
          ? "You were logged out because your session ended. Log in again to keep planning. Changes made after your last save weren't kept."
          : ''
      }
      submitLabel="Log in"
      pending={logIn.isPending}
      error={logIn.error?.message ?? ''}
      onSubmit={() => logIn.mutate({ email, password })}
      footer={
        <span>
          New here?{' '}
          <Link to="/signup" state={state} className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </span>
      }
    >
      <Field label="Email">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
    </AuthCard>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import AuthCard from '@/components/AuthCard';
import Field from '@/components/Field';
import { Input } from '@/components/ui/input';
import { useLogIn } from '@/queries';

export default function LogInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const logIn = useLogIn();

  return (
    <AuthCard
      title="Log in"
      description="Pick up your 4-year plan where you left off."
      submitLabel="Log in"
      pending={logIn.isPending}
      error={logIn.error?.message ?? ''}
      onSubmit={() => logIn.mutate({ email, password })}
      footer={
        <span>
          New here?{' '}
          <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
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

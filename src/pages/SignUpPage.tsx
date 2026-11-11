import { useState } from 'react';
import { Link } from 'react-router';
import AuthCard from '@/components/AuthCard';
import Field from '@/components/Field';
import { Input } from '@/components/ui/input';
import { useSignUp } from '@/queries';

// Fall quarters a student could have started in: the last 8 years, and next fall for
// incoming students.
function startYearChoices(today: Date = new Date()): number[] {
  const nextFall = today.getFullYear() + 1;
  return Array.from({ length: 9 }, (_, i) => nextFall - i);
}

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [startYear, setStartYear] = useState('');
  const [missingYear, setMissingYear] = useState(false);
  const signUp = useSignUp();

  const submit = () => {
    if (!startYear) return setMissingYear(true);
    signUp.mutate({ email, password, startYear: Number(startYear) });
  };

  return (
    <AuthCard
      title="Create an account"
      description="Your plan is saved to your account, so it's there whenever you log in."
      submitLabel="Create account"
      pending={signUp.isPending}
      error={missingYear && !startYear ? 'Choose the quarter you started at SCU' : (signUp.error?.message ?? '')}
      onSubmit={submit}
      footer={
        <span>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </span>
      }
    >
      <Field label="Email">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="First quarter at SCU" hint="Year 1 of your plan starts this fall.">
        <select
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          value={startYear}
          onChange={(e) => setStartYear(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {startYearChoices().map((year) => (
            <option key={year} value={year}>
              Fall {year}
            </option>
          ))}
        </select>
      </Field>
    </AuthCard>
  );
}

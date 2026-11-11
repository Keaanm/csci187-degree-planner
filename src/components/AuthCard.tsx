import type { FormEvent, ReactNode } from 'react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// The card around the log-in and sign-up forms. `error` is the server's message.
export default function AuthCard({ title, description, notice = '', submitLabel, pending, error, onSubmit, footer, children }: {
  title: string;
  description: string;
  // Shown above the form, for example why the student was logged out.
  notice?: string;
  submitLabel: string;
  pending: boolean;
  error: string;
  onSubmit: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending) onSubmit();
  };
  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-center gap-2 font-semibold">
        <Logo className="size-8" />
        SCU Degree Planner
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
          {notice && (
            <p className="rounded-md border bg-muted px-3 py-2 text-sm" role="status">
              {notice}
            </p>
          )}
        </CardHeader>
        <form onSubmit={submit} noValidate>
          <CardContent className="space-y-4">
            {children}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {/* aria-disabled instead of disabled, so focus stays on the button while waiting. */}
            <Button type="submit" className="w-full" aria-disabled={pending}>
              {pending ? 'Please wait…' : submitLabel}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
      </Card>
    </div>
  );
}

import { getErrorMessage } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';

export default function LoadError({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-6" role="alert">
      <p className="text-destructive">
        Couldn't load data from the server ({getErrorMessage(error)}). Make sure the backend is running.
      </p>
      <Button variant="outline" onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  );
}

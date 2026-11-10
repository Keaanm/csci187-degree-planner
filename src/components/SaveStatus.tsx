import { Button } from '@/components/ui/button';
import { usePlan } from '@/PlanContext';

// The plan saves itself; this shows how that's going.
export default function SaveStatus() {
  const { saved, lastSaved, saving, saveError, retrySave } = usePlan();

  if (saveError) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-destructive" role="alert">
          Couldn't save: {saveError}
        </span>
        <Button size="sm" variant="outline" onClick={retrySave}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {saving ? 'Saving…' : saved ? savedText(lastSaved) : 'Unsaved changes'}
    </p>
  );
}

function savedText(lastSaved: string | null): string {
  if (!lastSaved) return 'Not saved yet';
  return `Saved ${new Date(lastSaved).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

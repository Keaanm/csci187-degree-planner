import { Button } from '@/components/ui/button';
import { usePlan } from '@/PlanContext';

export default function SaveBar() {
  const { saved, lastSaved, save, saving, saveError } = usePlan();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {saveError && (
        <span className="text-destructive" role="alert">
          Couldn't save: {saveError}
        </span>
      )}
      <span className="text-muted-foreground">{saved ? savedText(lastSaved) : 'Unsaved changes'}</span>
      <Button size="sm" onClick={save} disabled={saved || saving}>
        {saving ? 'Saving…' : 'Save plan'}
      </Button>
    </div>
  );
}

function savedText(lastSaved: string | null): string {
  if (!lastSaved) return 'Not saved yet';
  return `Saved ${new Date(lastSaved).toLocaleString()}`;
}

import { usePlans } from '@/PlansContext';
import { usePrograms, useUpdatePlan } from '@/queries';

// Chooses the open plan's CS emphasis, which decides which requirements it checks.
export default function EmphasisPicker() {
  const { openPlan, planId } = usePlans();
  const programs = usePrograms();
  const update = useUpdatePlan();
  const emphases = programs.filter((p) => p.kind === 'emphasis');
  const current = openPlan.programId;
  // While a change saves, show the new choice.
  const shown = update.isPending && update.variables.planId === planId ? update.variables.programId : current;

  return (
    <div className="space-y-1.5">
      <label htmlFor="emphasis-picker" className="text-sm font-medium">
        Emphasis
      </label>
      <select
        id="emphasis-picker"
        className="h-8 w-full rounded-md border bg-background px-2 text-sm"
        value={shown ?? ''}
        disabled={update.isPending}
        onChange={(e) => update.mutate({ planId, programId: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Choose an emphasis</option>
        {emphases.map((p) => (
          <option key={p.programId} value={p.programId}>
            {p.name}
          </option>
        ))}
      </select>
      {current === null && !update.isPending && (
        <p className="text-sm text-muted-foreground">Choose your emphasis to see its requirements. Until then, only the major's requirements are checked.</p>
      )}
      {update.isError && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't change the emphasis: {update.error.message}
        </p>
      )}
    </div>
  );
}

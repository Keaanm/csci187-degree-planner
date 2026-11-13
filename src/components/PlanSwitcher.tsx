import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_PLAN_NAME_LENGTH } from '@/api';
import Field from '@/components/Field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePlan } from '@/PlanContext';
import { usePlans } from '@/PlansContext';
import { useCreatePlan, useDeletePlan, useRenamePlan } from '@/queries';

type OpenDialog = 'new' | 'rename' | 'delete' | null;

// Picks which of the student's plans is open, and makes, copies, renames and deletes plans.
// Opening another plan waits until the open plan's changes are saved, so none are lost.
export default function PlanSwitcher() {
  const { plans, planId, selectPlan, opening } = usePlans();
  const { saved, saveError } = usePlan();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // A plan to open as soon as the open plan's changes are saved.
  const [waitingFor, setWaitingFor] = useState<number | null>(null);
  const current = plans.find((p) => p.planId === planId) ?? plans[0];

  useEffect(() => {
    if (waitingFor !== null && saved) {
      setWaitingFor(null);
      selectPlan(waitingFor);
    }
  }, [waitingFor, saved, selectPlan]);

  const open = (id: number) => {
    if (id === planId) return;
    if (saved) selectPlan(id);
    else setWaitingFor(id);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="plan-switcher" className="sr-only">
        Plan
      </label>
      <select
        id="plan-switcher"
        className="h-8 max-w-56 truncate rounded-md border bg-background px-2 text-sm"
        value={planId}
        disabled={opening}
        onChange={(e) => open(Number(e.target.value))}
      >
        {plans.map((p) => (
          <option key={p.planId} value={p.planId}>
            {p.name}
          </option>
        ))}
      </select>
      <Button size="sm" variant="outline" onClick={() => setDialog('new')}>
        New plan
      </Button>
      <Button size="sm" variant="outline" onClick={() => setDialog('rename')}>
        Rename
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={plans.length === 1}
        title={plans.length === 1 ? 'You need at least one plan' : undefined}
        onClick={() => setDialog('delete')}
      >
        Delete
      </Button>
      {opening && (
        <span className="text-sm text-muted-foreground" role="status">
          Opening…
        </span>
      )}

      {dialog === 'new' && <NewPlanDialog copyable={current.name} onClose={() => setDialog(null)} onCreated={open} />}
      {dialog === 'rename' && <RenameDialog planId={planId} name={current.name} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog planId={planId} name={current.name} onClose={() => setDialog(null)} />}

      <Dialog open={waitingFor !== null} onOpenChange={(isOpen) => !isOpen && setWaitingFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{saveError ? 'Switch plans without saving?' : 'Your changes are still saving'}</DialogTitle>
            <DialogDescription>
              {saveError
                ? `Your latest changes to “${current.name}” couldn't be saved. If you switch now, they'll be lost.`
                : `The other plan opens as soon as they're saved. If you switch now, they'll be lost.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitingFor(null)}>
              Stay on this plan
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = waitingFor;
                setWaitingFor(null);
                if (id !== null) selectPlan(id);
              }}
            >
              Switch now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The name as the server checks it: trimmed, 1 to 60 characters.
function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the plan a name';
  if ([...trimmed].length > MAX_PLAN_NAME_LENGTH) return `Use at most ${MAX_PLAN_NAME_LENGTH} characters`;
  return null;
}

function NewPlanDialog({ copyable, onClose, onCreated }: {
  copyable: string;
  onClose: () => void;
  onCreated: (planId: number) => void;
}) {
  const { planId } = usePlans();
  const { saved, saveError } = usePlan();
  const create = useCreatePlan();
  const [name, setName] = useState('');
  const [copy, setCopy] = useState(false);
  const [touched, setTouched] = useState(false);
  const problem = nameProblem(name);
  // A copy is made from the saved plan, so it waits for unsaved changes.
  const waitingToCopy = copy && !saved;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || waitingToCopy) return;
    create.mutate(
      { name: name.trim(), copyFrom: copy ? planId : undefined },
      {
        onSuccess: (created) => {
          onClose();
          onCreated(created.planId);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New plan</DialogTitle>
            <DialogDescription>Try a “what if” without changing your other plans.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input
              value={name}
              maxLength={MAX_PLAN_NAME_LENGTH}
              placeholder="What if I study abroad"
              aria-invalid={touched && !!problem}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Start with</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="start" checked={!copy} onChange={() => setCopy(false)} />
              No courses
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="start" checked={copy} onChange={() => setCopy(true)} />
              <span className="min-w-0 truncate">A copy of “{copyable}”</span>
            </label>
          </fieldset>
          {touched && problem && (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          )}
          {waitingToCopy && (
            <p className="text-sm text-muted-foreground" role="status">
              {saveError ? `“${copyable}” has changes that couldn't be saved. Save them first to copy them.` : 'Saving your changes first…'}
            </p>
          )}
          {create.isError && (
            <p className="text-sm text-destructive" role="alert">
              Couldn't make the plan: {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || waitingToCopy}>
              Make plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ planId, name: oldName, onClose }: { planId: number; name: string; onClose: () => void }) {
  const rename = useRenamePlan();
  const [name, setName] = useState(oldName);
  const [touched, setTouched] = useState(false);
  const problem = nameProblem(name);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    if (name.trim() === oldName) return onClose();
    rename.mutate({ planId, name: name.trim() }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Rename plan</DialogTitle>
            <DialogDescription>Only the name changes. The courses stay the same.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input
              value={name}
              maxLength={MAX_PLAN_NAME_LENGTH}
              aria-invalid={touched && !!problem}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          {touched && problem && (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          )}
          {rename.isError && (
            <p className="text-sm text-destructive" role="alert">
              Couldn't rename the plan: {rename.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={rename.isPending}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ planId, name, onClose }: { planId: number; name: string; onClose: () => void }) {
  const remove = useDeletePlan();
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            The plan and all its courses are deleted. This can't be undone. Your oldest remaining plan opens instead.
          </DialogDescription>
        </DialogHeader>
        {remove.isError && (
          <p className="text-sm text-destructive" role="alert">
            Couldn't delete the plan: {remove.error.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(planId, { onSuccess: onClose })}>
            Delete plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

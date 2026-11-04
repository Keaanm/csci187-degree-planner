import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MAX_UNITS_PER_QUARTER, QUARTER_COUNT, quarterLabel } from '@/DegreePlan';
import { usePlan } from '@/PlanContext';

// Adds a course to a quarter the student picks.
export default function AddToPlan({ code }: { code: string }) {
  const { plan, changePlan } = usePlan();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  function changeOpen(next: boolean) {
    setOpen(next);
    setError('');
  }

  function add(quarter: number) {
    try {
      changePlan(plan.addCourse(quarter, code));
      changeOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6" aria-label={`Add ${code} to the plan`}>
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <p className="px-2 pb-2 text-sm font-medium">Add {code} to…</p>
        <ul className="max-h-72 overflow-y-auto">
          {Array.from({ length: QUARTER_COUNT }, (_, q) => (
            <li key={q}>
              <button
                type="button"
                className="flex w-full justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => add(q)}
              >
                {quarterLabel(q)}
                <span className="text-muted-foreground">
                  {plan.unitsIn(q)}/{MAX_UNITS_PER_QUARTER}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="px-2 pt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

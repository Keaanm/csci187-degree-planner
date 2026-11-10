import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePlan } from '@/PlanContext';
import { useCatalog } from '@/queries';

// Searches the offered courses that aren't in the plan yet.
export default function CoursePicker({ label, onPick }: { label: string; onPick: (code: string) => void }) {
  const catalog = useCatalog();
  const { plan } = usePlan();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  function changeOpen(next: boolean) {
    setOpen(next);
    setSearch('');
  }

  function pick(code: string) {
    onPick(code);
    changeOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" aria-label={label}>
          <Plus /> Add course
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        {/* Filter with catalog.search so this matches the course lookup page. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search courses…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No matching courses.</CommandEmpty>
            {catalog.search(search).filter((c) => !plan.hasCourse(c.code)).map((c) => (
              <CommandItem key={c.code} value={c.code} onSelect={() => pick(c.code)}>
                <span className="w-20 shrink-0 font-medium">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.title}</span>
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{c.units} units</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Course } from '@/Course';

// "Add course" button that opens a searchable list. Picking a course calls onPick.
export default function CoursePicker({ courses, label, onPick }: {
  courses: Course[];
  label: string;
  onPick: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Start with an empty search each time the list opens.
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
        {/* Match the search as written, so "CSCI 10" doesn't also match "CSCI 180". */}
        <Command filter={(value, term) => (value.toLowerCase().includes(term.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search by code or title…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No matching courses.</CommandEmpty>
            {courses.map((c) => (
              <CommandItem key={c.code} value={`${c.code} ${c.title}`} onSelect={() => pick(c.code)}>
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

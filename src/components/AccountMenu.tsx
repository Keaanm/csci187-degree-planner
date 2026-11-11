import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePlan } from '@/PlanContext';
import type { Student } from '@/api';
import { useLogOut } from '@/queries';

// The logged-in email and a Log out button. Logging out with unsaved changes asks first,
// because they would be lost.
export default function AccountMenu({ student }: { student: Student }) {
  const { saved } = usePlan();
  const logOut = useLogOut();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="max-w-48 truncate text-muted-foreground" title={student.email}>
        {student.email}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={logOut.isPending}
        onClick={() => (saved ? logOut.mutate() : setConfirming(true))}
      >
        Log out
      </Button>
      {logOut.isError && (
        <span className="text-destructive" role="alert">
          Couldn't log out: {logOut.error.message}
        </span>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out without saving?</DialogTitle>
            <DialogDescription>Your latest changes haven't saved yet. If you log out now, they'll be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Stay logged in
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                logOut.mutate();
              }}
            >
              Log out anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
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

// The logged-in email and a Log out button. With unsaved changes, logging out asks first:
// it logs out by itself as soon as the changes save, or right away if the student chooses
// to lose them.
export default function AccountMenu({ student }: { student: Student }) {
  const { saved, saveError } = usePlan();
  const logOut = useLogOut();
  const [confirming, setConfirming] = useState(false);
  const { mutate: logOutNow } = logOut;

  useEffect(() => {
    if (confirming && saved) {
      setConfirming(false);
      logOutNow();
    }
  }, [confirming, saved, logOutNow]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
        <span className="basis-full text-destructive" role="alert">
          Couldn't log out: {logOut.error.message}
        </span>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{saveError ? 'Log out without saving?' : 'Your changes are still saving'}</DialogTitle>
            <DialogDescription>
              {saveError
                ? "Your latest changes couldn't be saved. If you log out now, they'll be lost."
                : "You'll be logged out as soon as they're saved. If you log out now, they'll be lost."}
            </DialogDescription>
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
              Log out now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

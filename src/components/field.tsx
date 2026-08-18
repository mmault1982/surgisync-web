import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * A labelled control with an optional required marker, hint and error.
 *
 * There is no shadcn `form.tsx` in this project — its react-hook-form
 * wrapper was never added, because only the login screen uses that library.
 * This is the house Form primitive instead: every form field in the app is
 * one of these wrapping a plain input.
 *
 * It began in the inventory feature's `dialog-parts.tsx` alongside
 * `KitSummary` and `PhotoCapture`, which are genuinely about kits. This one
 * never was, and the Directory Profiles screens are the second caller.
 */
export function Field({
  label,
  required,
  hint,
  hintTone,
  htmlFor,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintTone?: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {hint ? (
          <span className={cn('font-normal text-muted-foreground', hintTone)}>{hint}</span>
        ) : null}
      </Label>
      {children}
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

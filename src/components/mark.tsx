import { cn } from "@/lib/utils";

export function MaestroMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-fg", className)}
      aria-hidden="true"
    >
      <path
        d="M6 24 V8 l10 12 L26 8 v16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
      <path
        d="M16 22 v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

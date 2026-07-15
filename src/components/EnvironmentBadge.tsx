import { currentEnv } from "../config/env";

/**
 * Pill badge showing the non-production environment, mirroring the Flutter
 * app's `EnvironmentChip` (orange for staging, blue for local, hidden in
 * production).
 */
export function EnvironmentBadge() {
  const badge = currentEnv.badge;
  if (!badge) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${badge.colorClasses}`}
    >
      <CloudIcon />
      {badge.label}
    </span>
  );
}

function CloudIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.5 19H7a5 5 0 1 1 .9-9.92 6 6 0 0 1 11.4 2.17A3.5 3.5 0 0 1 17.5 19Z" />
    </svg>
  );
}

import { environmentFor } from '@/lib/environment';

export function EnvironmentBadge() {
  const environment = environmentFor(window.location.hostname);
  if (!environment) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold
                  ring-1 ring-inset ${environment.classes}`}
    >
      <CloudIcon />
      {environment.label}
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6 16.7" />
      <path d="M6 19h11.5" />
    </svg>
  );
}

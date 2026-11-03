// Keep in sync with public/favicon.svg.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#9d2235" />
      <path fill="#fff" d="M16 7 29 13l-13 6-13-6z" />
      <path fill="#fff" fillOpacity=".85" d="M9 16.2V21c0 2.2 3.1 4 7 4s7-1.8 7-4v-4.8l-7 3.2z" />
      <path stroke="#fff" strokeLinecap="round" strokeWidth="1.5" d="M26 14.4v6.1" />
      <circle cx="26" cy="21.6" r="1.4" fill="#fff" />
    </svg>
  );
}

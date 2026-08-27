type LogoProps = {
  className?: string;
  /** Animates the check drawing itself in, once, on mount. */
  animate?: boolean;
};

/**
 * The mark: a to-do box whose top-right corner is open, with the check sweeping
 * out through the gap. The box is the thing you haven't done; the check is you
 * doing it.
 */
export function Logo({ className, animate = false }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 6 H7.5 A4.5 4.5 0 0 0 3 10.5 V16.5 A4.5 4.5 0 0 0 7.5 21 H13.5 A4.5 4.5 0 0 0 18 16.5 V12"
        stroke="currentColor"
        strokeOpacity={0.38}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M7.6 13.2 L11.3 17 L20.8 4.6"
        stroke="var(--primary)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "logo-check" : undefined}
      />
    </svg>
  );
}

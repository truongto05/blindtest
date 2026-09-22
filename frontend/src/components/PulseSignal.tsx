/** Shared rhythm mark; status text belongs to the surrounding interface. */
export default function PulseSignal({
  animated = false,
  className = "",
}: {
  animated?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`pulse-signal ${animated ? "pulse-loader" : ""} ${className}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}

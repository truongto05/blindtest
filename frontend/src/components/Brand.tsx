type Props = { compact?: boolean; className?: string };

/** Reuses Pulse's vector mark in the interface, favicon and PWA. */
export default function Brand({ compact = false, className = "" }: Props) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2.5 ${className}`}>
      <img
        src="/pulse-icon.svg"
        width={36}
        height={36}
        alt={compact ? "Pulse" : ""}
        className="size-9 shrink-0"
      />
      {!compact && <span className="brand-wordmark text-zinc-100">Pulse</span>}
    </span>
  );
}

interface Props {
  autoForward: boolean;
  onChange: (v: boolean) => void;
}

export function AutoForwardToggle({ autoForward, onChange }: Props) {
  return (
    <button
      onClick={() => onChange(!autoForward)}
      className={[
        "flex items-center gap-2 px-2 py-1 rounded text-sm border transition-colors",
        autoForward
          ? "bg-[var(--success)]/15 border-[var(--success)]/40 text-[var(--success)]"
          : "bg-transparent border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
      ].join(" ")}
      title={
        autoForward
          ? "Auto-Forward ON: all events pass through automatically"
          : "Auto-Forward OFF: events pause at breakpoint"
      }
    >
      <span
        className={[
          "w-3 h-3 rounded-full border-2 shrink-0 transition-colors",
          autoForward
            ? "bg-[var(--success)] border-[var(--success)]"
            : "bg-transparent border-[var(--text-muted)]",
        ].join(" ")}
      />
      Auto-Forward
    </button>
  );
}

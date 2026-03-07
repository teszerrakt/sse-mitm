import { Switch } from "./ui/switch";
import { Label } from "./ui/label";

interface Props {
  autoForward: boolean;
  onChange: (v: boolean) => void;
}

export function AutoForwardToggle({ autoForward, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-2"
      title={
        autoForward
          ? "Auto-Forward ON: all events pass through automatically"
          : "Auto-Forward OFF: events pause at breakpoint"
      }
    >
      <Switch
        size="sm"
        checked={autoForward}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-[var(--success)]"
      />
      <Label
        className={`text-xs cursor-pointer select-none ${
          autoForward ? "text-[var(--success)]" : "text-[var(--text-muted)]"
        }`}
        onClick={() => onChange(!autoForward)}
      >
        Auto-Forward
      </Label>
    </div>
  );
}

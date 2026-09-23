import * as RadixSelect from "@radix-ui/react-select";
import styles from "./Select.module.css";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  "aria-label": string;
  "data-testid"?: string;
}

export function Select({ value, onValueChange, options, disabled, ...aria }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        className={styles.trigger}
        aria-label={aria["aria-label"]}
        data-testid={aria["data-testid"]}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon className={styles.icon}>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        {/* Radix's default "optimized" reposition strategy only reacts to
            scroll/resize events on the trigger's own box, not to a trigger
            simply moving because a sibling reflowed (no such event fires
            for that) -- the standings table swapping its short placeholder
            for twenty real rows used to push the player bar's speed-select
            down by ~600px while it could be open, and the popper never
            noticed. Fixing the player bar to the viewport bottom (App.css)
            removes that specific path, but the underlying Radix gap is
            general -- any Select below content that can resize while open
            would hit it -- so "always" (floating-ui's per-frame recompute
            while open) stays on as the defensive fix. */}
        <RadixSelect.Content
          className={styles.content}
          position="popper"
          sideOffset={4}
          updatePositionStrategy="always"
        >
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} className={styles.item}>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className={styles.indicator}>✓</RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

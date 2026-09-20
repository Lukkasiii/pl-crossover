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
}

export function Select({ value, onValueChange, options, disabled, ...aria }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger className={styles.trigger} aria-label={aria["aria-label"]}>
        <RadixSelect.Value />
        <RadixSelect.Icon className={styles.icon}>▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={4}>
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

import * as RadixSlider from "@radix-ui/react-slider";
import styles from "./Slider.module.css";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  "aria-label": string;
  onValueChange: (value: number) => void;
  onValueCommit: (value: number) => void;
}

export function Slider({ value, min, max, disabled, onValueChange, onValueCommit, ...aria }: SliderProps) {
  return (
    <RadixSlider.Root
      className={styles.root}
      min={min}
      max={max}
      step={1}
      value={[value]}
      disabled={disabled}
      onValueChange={([v]) => onValueChange(v)}
      onValueCommit={([v]) => onValueCommit(v)}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      {/* role="slider" lives on the Thumb, not the Root -- an aria-label on
          Root never reaches assistive tech, which announces an unnamed
          slider. */}
      <RadixSlider.Thumb className={styles.thumb} aria-label={aria["aria-label"]} />
    </RadixSlider.Root>
  );
}

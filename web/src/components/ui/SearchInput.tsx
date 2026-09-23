import styles from "./SearchInput.module.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  "aria-label": string;
  clearAriaLabel: string;
  "data-testid"?: string;
}

/**
 * Extracted from StandingsTable's own search box (the first place this
 * pattern was built) so /teams can reuse the exact same look and behaviour
 * instead of a second, drifting copy -- see CLAUDE.md "3c. /teams".
 */
export function SearchInput({ value, onChange, placeholder, clearAriaLabel, "data-testid": testId, ...aria }: SearchInputProps) {
  return (
    <div className={styles.box}>
      <input
        type="text"
        className={styles.input}
        data-testid={testId}
        aria-label={aria["aria-label"]}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          aria-label={clearAriaLabel}
          data-testid={testId ? `${testId}-clear` : undefined}
          onClick={() => onChange("")}
        >
          ✕
        </button>
      )}
    </div>
  );
}

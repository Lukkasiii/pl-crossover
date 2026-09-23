import * as Popover from "@radix-ui/react-popover";
import styles from "./InfoTooltip.module.css";

interface InfoTooltipProps {
  /** Names the panel for assistive tech, e.g. t("panelInfo.about", { panel: t("replay.rmseCurve") }). */
  "aria-label": string;
  /** The explanation shown in the popover. */
  children: string;
  "data-testid"?: string;
}

/**
 * A 16px circled "i" beside a panel title, opened by click (not hover --
 * hover has no equivalent on touch) into a popover explaining what the
 * panel is for. Built on Radix Popover rather than the Tooltip used
 * elsewhere (StandingsTable's column-header abbreviations): a tooltip is
 * hover/focus-only and has no click-to-open, click-outside-or-Escape-to-
 * dismiss, or aria-expanded semantics -- this needs all four.
 * `updatePositionStrategy="always"` matches Select.tsx's Radix content:
 * the same Popper gap where only a scroll/resize on the trigger's own box
 * reflows the popper, not a sibling resizing the page around it.
 */
export function InfoTooltip({ children, "data-testid": testId, ...aria }: InfoTooltipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger className={styles.trigger} aria-label={aria["aria-label"]} data-testid={testId}>
        <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="5.25" r="0.9" fill="currentColor" />
          <line x1="8" y1="7.5" x2="8" y2="11.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.content} sideOffset={6} updatePositionStrategy="always">
          {children}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

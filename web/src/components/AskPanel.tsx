import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { useAsk, type AskOut } from "../api/useAsk";
import { useStreamingText } from "../hooks/useStreamingText";
import type { TranslationKey } from "../i18n/dictionaries";
import styles from "./AskPanel.module.css";

type RelatesTo = AskOut["toolCalls"][number]["relatesTo"];

const PRESET_QUESTIONS: { id: string; labelKey: TranslationKey }[] = [
  { id: "crossover-round-12", labelKey: "askPanel.question.crossoverRound12" },
  { id: "sigma-prior-10", labelKey: "askPanel.question.sigmaPrior10" },
  { id: "fastest-metric", labelKey: "askPanel.question.fastestMetric" },
  { id: "pooled-vs-per-season", labelKey: "askPanel.question.pooledVsPerSeason" },
  { id: "prior-share-by-checkpoint", labelKey: "askPanel.question.priorShare" },
];

// A short, per-tool summary for the chip's own result -- the two tools'
// result shapes are different enough (a blend vs. a curve) that a generic
// "first field" summary would read as noise.
function summarizeResult(call: AskOut["toolCalls"][number]): string {
  const r = call.result as Record<string, unknown>;
  if (call.tool === "get_posterior") return `blended RMSE ${r.blended_rmse}`;
  return `crossover ≈ ${r.crossover} games`;
}

const ANNOUNCE_EVERY_CHARS = 60;
const CHARS_PER_FRAME = 2;
const HIGHLIGHT_MS = 2500;

interface AskPanelProps {
  onHighlight: (target: RelatesTo | null) => void;
}

/**
 * See CLAUDE.md "Feature 3": no live LLM, so this panel drives a fixed set
 * of preset questions whose tool calls + answers were generated once
 * against the real data and committed as fixtures (api/app/ask_fixtures.json,
 * useAsk.ts). The streaming below is real -- it replays the cached answer a
 * few characters per animation frame -- the model call behind it is not.
 */
export function AskPanel({ onHighlight }: AskPanelProps) {
  const { t, locale } = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useAsk(selectedId, locale);
  const { visibleText, done, stop } = useStreamingText(data?.answer ?? "", CHARS_PER_FRAME);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const liveRegionRef = useRef<HTMLParagraphElement>(null);
  const announcedLengthRef = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autoscroll only while the user hasn't scrolled away from the bottom --
  // a long cached answer streaming in must not fight a reader who scrolled
  // up to re-read an earlier sentence.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [visibleText]);

  // Throttled aria-live: update the hidden announcer every ~60 characters
  // (and once more on completion), not on every character -- a screen
  // reader user gets a handful of sensible chunks instead of a token flood.
  useEffect(() => {
    if (!liveRegionRef.current) return;
    if (visibleText.length - announcedLengthRef.current >= ANNOUNCE_EVERY_CHARS || (done && visibleText)) {
      liveRegionRef.current.textContent = visibleText;
      announcedLengthRef.current = visibleText.length;
    }
  }, [visibleText, done]);

  useEffect(() => {
    announcedLengthRef.current = 0;
    pinnedRef.current = true;
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  function handleHighlight(target: RelatesTo) {
    onHighlight(target);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => onHighlight(null), HIGHLIGHT_MS);
  }

  function reset() {
    setSelectedId(null);
    onHighlight(null);
  }

  return (
    <section className="panel" data-testid="ask-panel">
      <div className="panel-header">
        <h2>{t("askPanel.heading")}</h2>
      </div>

      {selectedId === null ? (
        <>
          <p className="panel-framing">{t("askPanel.framing")}</p>
          <div className={styles.presetList} role="group" aria-label={t("askPanel.presetsLabel")}>
            {PRESET_QUESTIONS.map((q) => (
              <button key={q.id} type="button" data-testid={`ask-preset-${q.id}`} onClick={() => setSelectedId(q.id)}>
                {t(q.labelKey)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div>
          <p className={styles.question} data-testid="ask-question">
            {data?.question ?? t(PRESET_QUESTIONS.find((q) => q.id === selectedId)?.labelKey ?? "askPanel.heading")}
          </p>

          {isLoading && <p className="predict-note">{t("askPanel.loading")}</p>}
          {error && <p className="predict-note error">{t("askPanel.failedToLoad")}</p>}

          {data && (
            <>
              {data.toolCalls.length > 0 && (
                <>
                  <p className={styles.toolCallsHeading}>{t("askPanel.toolCallsHeading")}</p>
                  <div className={styles.chips} data-testid="ask-tool-calls">
                    {data.toolCalls.map((call, i) => (
                      <button
                        key={i}
                        type="button"
                        className={styles.chip}
                        data-testid="ask-tool-call-chip"
                        onClick={() => handleHighlight(call.relatesTo)}
                        title={JSON.stringify(call.result)}
                      >
                        <code>{call.label}</code>
                        <span className={styles.chipResult}>{summarizeResult(call)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className={styles.answerScroll} ref={scrollRef} onScroll={handleScroll} data-testid="ask-answer">
                <p>{visibleText}</p>
              </div>
              {/* Throttled announcer -- see the effect above. Visually hidden;
                  the visible answer text above is decorative to assistive
                  tech while it is mid-reveal (aria-hidden) so a screen reader
                  never reads a half-formed sentence. */}
              <p className={styles.visuallyHidden} aria-live="polite" ref={liveRegionRef} />

              <div className={styles.controls}>
                {!done && (
                  <button type="button" onClick={stop} data-testid="ask-stop">
                    {t("askPanel.stop")}
                  </button>
                )}
                <button type="button" onClick={reset} data-testid="ask-another">
                  {t("askPanel.askAnother")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

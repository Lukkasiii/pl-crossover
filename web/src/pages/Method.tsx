import { useEffect } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { METRIC_LABEL_KEYS } from "../metricLabels";
import { CurvesDiagram, SlopeDiagram, WeightDiagram } from "../components/MethodDiagrams";
import type { Metric } from "../ws/types";

// Verbatim from CLAUDE.md "Results to preserve" -- scripts/validate_checkpoints.py
// is the regression test that keeps these ten published figures honest.
const RESULTS: { metric: Metric; priorRmse: number; crossover: number; at: [number, number, number, number, number] }[] = [
  { metric: "xg", priorRmse: 4.088, crossover: 11.8, at: [4.507, 4.174, 3.869, 3.635, 3.45] },
  { metric: "xgd", priorRmse: 3.764, crossover: 13.3, at: [4.484, 3.963, 3.595, 3.304, 3.08] },
  { metric: "gd", priorRmse: 3.821, crossover: 8.5, at: [4.274, 3.774, 3.434, 2.903, 2.329] },
  { metric: "points", priorRmse: 3.947, crossover: 6.5, at: [4.218, 3.546, 3.068, 2.585, 1.744] },
];
const CHECKPOINTS = [5, 10, 15, 20, 38];

/**
 * An explainer, not an appendix: each section opens with the idea in plain
 * words, introduces a term (RMSE, xG, the prior) in the clause where it is
 * first needed, and lets a diagram show the mechanism. The results table
 * stays -- it is the evidence -- but arrives last, as confirmation of what
 * the prose already argued.
 */
export default function Method() {
  const { t, formatNumber } = useLocale();

  useEffect(() => {
    document.title = `${t("nav.method")} — ${t("nav.siteTitle")}`;
  }, [t]);

  const fixed = (v: number, digits: number) =>
    formatNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div data-testid="page-method">
      <header className="app-header">
        <h1>{t("nav.method")}</h1>
        <p className="subtitle">{t("method.intro")}</p>
      </header>

      <div className="page-stack method-page">
        <section className="panel prose">
          <h2>{t("method.question.heading")}</h2>
          <p>{t("method.question.p1")}</p>
          <SlopeDiagram />
          <p>{t("method.question.p2")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.measure.heading")}</h2>
          <p>{t("method.measure.p1")}</p>
          <p>{t("method.measure.p2")}</p>
          <p>{t("method.measure.p3")}</p>
          <CurvesDiagram />
          <p>{t("method.measure.p4")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.blend.heading")}</h2>
          <p>{t("method.blend.intro")}</p>
          <pre className="method-formula">
            mu* = (w_prior · mu_prior + w_data · y_bar) / (w_prior + w_data)
          </pre>
          <p>{t("method.blend.weights")}</p>
          <WeightDiagram />
          <p>{t("method.blend.twoCrossovers")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.methodologies.heading")}</h2>
          <p>{t("method.methodologies.intro")}</p>
          <p>{t("method.methodologies.pooled")}</p>
          <p>{t("method.methodologies.perSeason")}</p>
          <p>{t("method.methodologies.rankBased")}</p>
          <p>{t("method.methodologies.rule")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.results.heading")}</h2>
          <p>{t("method.results.intro")}</p>
          {/* Same fix TeamDetail.tsx's tables use -- see CLAUDE.md "v2 --
              multi-page dashboard": overflow-x: auto on the wrapper, plus
              tabIndex + role/aria-label so axe's scrollable-region-focusable
              is satisfied. An 8-column table is exactly the shape that pushes
              the page wider than the viewport at narrow widths. */}
          <div className="table-scroll-wrap" tabIndex={0} role="region" aria-label={t("method.results.scrollableRegion")}>
            <table className="method-results-table" data-testid="method-results-table">
              <caption className="method-table-caption">{t("method.results.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("method.results.col.metric")}</th>
                  <th scope="col">{t("method.results.col.priorRmse")}</th>
                  <th scope="col">{t("method.results.col.crossover")}</th>
                  {CHECKPOINTS.map((g) => (
                    <th scope="col" key={g}>
                      @{g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESULTS.map((row) => (
                  <tr key={row.metric}>
                    <th scope="row">{t(METRIC_LABEL_KEYS[row.metric])}</th>
                    <td>{fixed(row.priorRmse, 3)}</td>
                    <td>{fixed(row.crossover, 1)}</td>
                    {row.at.map((v, i) => (
                      <td key={CHECKPOINTS[i]}>{fixed(v, 3)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{t("method.results.note")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.constraints.heading")}</h2>
          <p>{t("method.constraints.gamesPlayed")}</p>
          <p>{t("method.constraints.promoted")}</p>
        </section>
      </div>
    </div>
  );
}

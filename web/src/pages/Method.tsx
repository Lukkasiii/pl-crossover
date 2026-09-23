import { useEffect } from "react";
import { useLocale } from "../i18n/LocaleContext";

// Verbatim from CLAUDE.md "Results to preserve" -- scripts/validate_checkpoints.py
// is the regression test that keeps these ten published figures honest.
const RESULTS = [
  { metric: "xg", priorRmse: 4.088, crossover: 11.8, at5: 4.507, at10: 4.174, at15: 3.869, at20: 3.635, at38: 3.45 },
  { metric: "xgd", priorRmse: 3.764, crossover: 13.3, at5: 4.484, at10: 3.963, at15: 3.595, at20: 3.304, at38: 3.08 },
  { metric: "gd", priorRmse: 3.821, crossover: 8.5, at5: 4.274, at10: 3.774, at15: 3.434, at20: 2.903, at38: 2.329 },
  { metric: "points", priorRmse: 3.947, crossover: 6.5, at5: 4.218, at10: 3.546, at15: 3.068, at20: 2.585, at38: 1.744 },
];

export default function Method() {
  const { t } = useLocale();

  useEffect(() => {
    document.title = `${t("nav.method")} — ${t("nav.siteTitle")}`;
  }, [t]);

  return (
    <div data-testid="page-method">
      <header className="app-header">
        <h1>{t("nav.method")}</h1>
        <p className="subtitle">{t("method.intro")}</p>
      </header>

      <div className="page-stack">
        <section className="panel prose">
          <h2>{t("method.methodologies.heading")}</h2>
          <p>{t("method.methodologies.pooled")}</p>
          <p>{t("method.methodologies.perSeason")}</p>
          <p>{t("method.methodologies.rankBased")}</p>
          <p>{t("method.methodologies.rule")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.results.heading")}</h2>
          <p>{t("method.results.intro")}</p>
          <table className="method-results-table" data-testid="method-results-table">
            <thead>
              <tr>
                <th scope="col">{t("method.results.col.metric")}</th>
                <th scope="col">{t("method.results.col.priorRmse")}</th>
                <th scope="col">{t("method.results.col.crossover")}</th>
                <th scope="col">@5</th>
                <th scope="col">@10</th>
                <th scope="col">@15</th>
                <th scope="col">@20</th>
                <th scope="col">@38</th>
              </tr>
            </thead>
            <tbody>
              {RESULTS.map((row) => (
                <tr key={row.metric}>
                  <th scope="row">{row.metric}</th>
                  <td>{row.priorRmse.toFixed(3)}</td>
                  <td>{row.crossover.toFixed(1)}</td>
                  <td>{row.at5.toFixed(3)}</td>
                  <td>{row.at10.toFixed(3)}</td>
                  <td>{row.at15.toFixed(3)}</td>
                  <td>{row.at20.toFixed(3)}</td>
                  <td>{row.at38.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t("method.results.note")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.blend.heading")}</h2>
          <p>{t("method.blend.intro")}</p>
          <pre className="method-formula">
            mu* = (w_prior · mu_prior + w_data · y_bar) / (w_prior + w_data)
          </pre>
          <p>{t("method.blend.priorWeight")}</p>
          <p>{t("method.blend.dataWeight")}</p>
          <p>{t("method.blend.priorShare")}</p>
        </section>

        <section className="panel prose">
          <h2>{t("method.constraints.heading")}</h2>
          <p>{t("method.constraints.gamesPlayed")}</p>
          <p>{t("method.constraints.twoCrossovers")}</p>
        </section>
      </div>
    </div>
  );
}

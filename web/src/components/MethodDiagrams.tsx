import { useMemo } from "react";
import { usePooledCurve } from "../api/usePooledCurve";
import { useLocale } from "../i18n/LocaleContext";
import { broadcastName } from "../teamNames";

/**
 * The /method page's three diagrams, drawn as inline SVG so each shows the
 * mechanism rather than decorating it. Every viewBox is designed at phone
 * width (360 units) and capped at a modest max-width in CSS, so the SVG text
 * scales between roughly 10px and 14px instead of shrinking to nothing on a
 * phone or ballooning on a desktop. Colours are the app's own tokens, read
 * through CSS custom properties, so there is one palette for charts and
 * diagrams alike.
 */

// The 17 clubs in both 2023/24 and 2024/25 (season pair 8). Prior rank is
// team_state.live_rank at games_played = 38 of the 2023/24 season; current
// rank is pair_teams.final_rank -- both straight from data/pl.db.
const SLOPE_PAIR = { prior: "2023/24", current: "2024/25" };
const SLOPE_ROWS: [name: string, prior: number, current: number][] = [
  ["Manchester City", 1, 3],
  ["Arsenal", 2, 2],
  ["Liverpool", 3, 1],
  ["Aston Villa", 4, 6],
  ["Tottenham", 5, 17],
  ["Chelsea", 6, 4],
  ["Newcastle United", 7, 5],
  ["Manchester United", 8, 15],
  ["West Ham", 9, 14],
  ["Crystal Palace", 10, 12],
  ["Brighton", 11, 8],
  ["Everton", 12, 13],
  ["Bournemouth", 13, 9],
  ["Fulham", 14, 11],
  ["Wolverhampton Wanderers", 15, 16],
  ["Brentford", 16, 10],
  ["Nottingham Forest", 17, 7],
];
/** A move this many places or more is drawn as a miss, not as noise. */
const BIG_MOVE = 5;

// api/app/model.py DEFAULT_PRIOR_WEIGHT / DEFAULT_OBS_VARIANCE.
const PRIOR_WEIGHT = 5;
const OBS_VARIANCE = 1.5;
const priorShare = (games: number) => PRIOR_WEIGHT / (PRIOR_WEIGHT + games / OBS_VARIANCE);
/** w_data = N / sigma²_obs reaches w_prior at N = w_prior x sigma²_obs. */
const WEIGHT_PARITY_GAMES = PRIOR_WEIGHT * OBS_VARIANCE;
const SEASON_GAMES = 38;

export function SlopeDiagram() {
  const { t } = useLocale();
  const top = 34;
  const step = 17;
  const y = (rank: number) => top + (rank - 1) * step;
  const leftX = 134;
  const rightX = 226;
  // 17 clubs finish in 17 distinct places on each side (the 3 promoted and
  // 3 relegated clubs are the ones missing), so the ranks stop at 17.
  const height = y(Math.max(...SLOPE_ROWS.flatMap(([, p, c]) => [p, c]))) + 12;

  return (
    <figure className="method-figure">
      <svg
        viewBox={`0 0 360 ${height}`}
        className="method-diagram"
        role="img"
        aria-label={t("method.fig.slope.label", SLOPE_PAIR)}
        data-testid="method-slope-diagram"
      >
        <text x={leftX} y={14} textAnchor="middle" className="md-heading">
          {SLOPE_PAIR.prior}
        </text>
        <text x={rightX} y={14} textAnchor="middle" className="md-heading">
          {SLOPE_PAIR.current}
        </text>
        {SLOPE_ROWS.map(([name, prior, current]) => {
          const big = Math.abs(current - prior) >= BIG_MOVE;
          const label = broadcastName(name);
          return (
            <g key={name} className={big ? "md-slope md-slope-big" : "md-slope"}>
              <line x1={leftX} y1={y(prior)} x2={rightX} y2={y(current)} />
              <circle cx={leftX} cy={y(prior)} r={3} />
              <circle cx={rightX} cy={y(current)} r={3} />
              <text x={leftX - 8} y={y(prior)} dy="0.35em" textAnchor="end">
                {prior}. {label}
              </text>
              <text x={rightX + 8} y={y(current)} dy="0.35em">
                {current}. {label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>{t("method.fig.slope.caption", { big: BIG_MOVE })}</figcaption>
    </figure>
  );
}

export function CurvesDiagram() {
  const { t, formatNumber } = useLocale();
  const { curve } = usePooledCurve("xg");

  const geo = useMemo(() => {
    if (!curve || curve.crossover === null) return null;
    const W = 360;
    const H = 220;
    const pad = { left: 36, right: 12, top: 28, bottom: 34 };
    const values = [...curve.currentRmse, curve.priorRmse];
    const lo = Math.floor(Math.min(...values) * 2) / 2;
    const hi = Math.ceil(Math.max(...values) * 2) / 2;
    const x = (g: number) => pad.left + ((g - 1) / (SEASON_GAMES - 1)) * (W - pad.left - pad.right);
    const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * (H - pad.top - pad.bottom);
    const path = curve.games.map((g, i) => `${i === 0 ? "M" : "L"}${x(g).toFixed(1)},${y(curve.currentRmse[i]).toFixed(1)}`).join(" ");
    const yTicks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += 0.5) yTicks.push(v);
    return { W, H, pad, x, y, path, yTicks, crossover: curve.crossover, prior: curve.priorRmse };
  }, [curve]);

  if (!geo) return <div className="method-figure method-figure-loading" aria-hidden="true" />;
  const fmt = (v: number, digits: number) => formatNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <figure className="method-figure">
      <svg
        viewBox={`0 0 ${geo.W} ${geo.H}`}
        className="method-diagram"
        role="img"
        aria-label={t("method.fig.curves.label", { prior: fmt(geo.prior, 2), games: fmt(geo.crossover, 1) })}
        data-testid="method-curves-diagram"
      >
        {geo.yTicks.map((v) => (
          <g key={v}>
            <line className="md-grid" x1={geo.pad.left} x2={geo.W - geo.pad.right} y1={geo.y(v)} y2={geo.y(v)} />
            <text className="md-tick" x={geo.pad.left - 6} y={geo.y(v)} dy="0.35em" textAnchor="end">
              {fmt(v, 1)}
            </text>
          </g>
        ))}
        {[1, 10, 20, 30, 38].map((g) => (
          <text key={g} className="md-tick" x={geo.x(g)} y={geo.H - geo.pad.bottom + 14} textAnchor="middle">
            {g}
          </text>
        ))}
        <text className="md-tick" x={(geo.pad.left + geo.W - geo.pad.right) / 2} y={geo.H - 4} textAnchor="middle">
          {t("chart.gamesPlayed")}
        </text>
        <line
          className="md-prior"
          x1={geo.pad.left}
          x2={geo.W - geo.pad.right}
          y1={geo.y(geo.prior)}
          y2={geo.y(geo.prior)}
        />
        <path className="md-current" d={geo.path} />
        <line
          className="md-crossover"
          x1={geo.x(geo.crossover)}
          x2={geo.x(geo.crossover)}
          y1={geo.pad.top - 6}
          y2={geo.H - geo.pad.bottom}
        />
        <text className="md-crossover-label" x={geo.x(geo.crossover) + 5} y={geo.pad.top - 10}>
          ⚡ {t("method.fig.curves.crossoverAt", { games: fmt(geo.crossover, 1) })}
        </text>
      </svg>
      <ul className="chart-legend">
        <li>
          <span className="chart-legend-swatch" style={{ borderTopColor: "var(--green)" }} aria-hidden="true" />
          {t("method.fig.curves.current")}
        </li>
        <li>
          <span className="chart-legend-swatch dashed" style={{ borderTopColor: "var(--red)" }} aria-hidden="true" />
          {t("method.fig.curves.prior")}
        </li>
      </ul>
      <figcaption>{t("method.fig.curves.caption")}</figcaption>
    </figure>
  );
}

export function WeightDiagram() {
  const { t, formatNumber } = useLocale();
  const W = 360;
  const H = 200;
  const pad = { left: 36, right: 12, top: 28, bottom: 34 };
  const x = (g: number) => pad.left + (g / SEASON_GAMES) * (W - pad.left - pad.right);
  const y = (share: number) => pad.top + (1 - share) * (H - pad.top - pad.bottom);

  // Prior share on top, data share below it: the boundary between them is
  // the prior's share of the blend, falling as games accumulate.
  const boundary: string[] = [];
  for (let g = 0; g <= SEASON_GAMES; g += 0.5) boundary.push(`${x(g).toFixed(1)},${y(1 - priorShare(g)).toFixed(1)}`);
  const priorArea = `M${x(0)},${y(1)} L${boundary.join(" L")} L${x(SEASON_GAMES)},${y(1)} Z`;
  const dataArea = `M${x(0)},${y(0)} L${boundary.join(" L")} L${x(SEASON_GAMES)},${y(0)} Z`;
  const pct = (v: number) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });
  const checkpoints = [5, 10, 15, 20];

  return (
    <figure className="method-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="method-diagram"
        role="img"
        aria-label={t("method.fig.weights.label", {
          parity: formatNumber(WEIGHT_PARITY_GAMES, { maximumFractionDigits: 1 }),
          shares: checkpoints.map((g) => `${g}: ${pct(priorShare(g))}`).join(", "),
        })}
        data-testid="method-weights-diagram"
      >
        <path className="md-area-prior" d={priorArea} />
        <path className="md-area-data" d={dataArea} />
        {[0, 0.5, 1].map((s) => (
          <text key={s} className="md-tick" x={pad.left - 6} y={y(s)} dy="0.35em" textAnchor="end">
            {pct(s)}
          </text>
        ))}
        {checkpoints.map((g) => (
          <g key={g}>
            <line className="md-checkpoint" x1={x(g)} x2={x(g)} y1={y(1)} y2={y(0)} />
            <text className="md-tick" x={x(g)} y={H - pad.bottom + 14} textAnchor="middle">
              {g}
            </text>
          </g>
        ))}
        {/* The prior's share at each checkpoint, printed above the plot rather
            than on the coloured areas so no label depends on contrast
            against a fill. */}
        {checkpoints.map((g) => (
          <text key={`s${g}`} className="md-share" x={x(g)} y={pad.top - 8} textAnchor="middle">
            {pct(priorShare(g))}
          </text>
        ))}
        <text className="md-tick" x={(pad.left + W - pad.right) / 2} y={H - 4} textAnchor="middle">
          {t("chart.gamesPlayed")}
        </text>
      </svg>
      <ul className="chart-legend">
        <li>
          <span className="chart-legend-block" style={{ background: "var(--red)" }} aria-hidden="true" />
          {t("method.fig.weights.prior")}
        </li>
        <li>
          <span className="chart-legend-block" style={{ background: "var(--blue)" }} aria-hidden="true" />
          {t("method.fig.weights.data")}
        </li>
      </ul>
      <figcaption>
        {t("method.fig.weights.caption", { parity: formatNumber(WEIGHT_PARITY_GAMES, { maximumFractionDigits: 1 }) })}
      </figcaption>
    </figure>
  );
}

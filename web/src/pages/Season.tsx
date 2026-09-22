import { useEffect, useState } from "react";
import { useSeasons } from "../api/useSeasons";
import { ReplayDashboard } from "../components/ReplayDashboard";
import { Select } from "../components/ui/Select";
import { useLocale } from "../i18n/LocaleContext";
import { useReplayParams } from "../state/ReplayParamsContext";

export default function Season() {
  const { t } = useLocale();
  const { pairs, error: seasonsError } = useSeasons();
  const { metric, setMetric, priorWeight, setPriorWeight, obsVariance } = useReplayParams();
  const [pairId, setPairId] = useState<number | null>(null);

  useEffect(() => {
    document.title = `${t("nav.season")} — ${t("nav.siteTitle")}`;
  }, [t]);

  const activePairId = pairId ?? pairs?.[0]?.id ?? null;
  const activePair = pairs?.find((p) => p.id === activePairId) ?? null;

  return (
    <div data-testid="page-season">
      <header className="app-header">
        <h1>{t("nav.season")}</h1>
        <p className="subtitle">{t("app.subtitle")}</p>

        <div className="toolbar">
          <Select
            aria-label={t("app.seasonPairLabel")}
            data-testid="season-pair-select"
            value={String(activePairId ?? "")}
            onValueChange={(v) => setPairId(Number(v))}
            disabled={!pairs}
            options={pairs?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
          />
          {seasonsError && <span className="error">{seasonsError}</span>}
        </div>
      </header>

      {activePairId !== null && activePair !== null && (
        <ReplayDashboard
          key={activePairId}
          pairId={activePairId}
          currentSeasonLabel={activePair.current_season}
          metric={metric}
          onMetricChange={setMetric}
          priorWeight={priorWeight}
          onPriorWeightChange={setPriorWeight}
          obsVariance={obsVariance}
        />
      )}
    </div>
  );
}

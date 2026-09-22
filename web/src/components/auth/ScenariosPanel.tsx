import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useScenarios, type ScenarioOut, type ScenarioParams } from "../../api/useScenarios";
import { useLocale } from "../../i18n/LocaleContext";
import type { TranslationKey } from "../../i18n/dictionaries";
import styles from "./ScenariosPanel.module.css";

const METRIC_LABEL_KEYS: Record<ScenarioParams["metric"], TranslationKey> = {
  xg: "replay.metric.xg",
  xgd: "replay.metric.xgd",
  gd: "replay.metric.gd",
  points: "replay.metric.points",
};
const METHOD_LABEL_KEYS: Record<ScenarioParams["method"], TranslationKey> = {
  pooled: "scenarios.method.pooled",
  per_season: "scenarios.method.per_season",
};

function summarize(t: (key: TranslationKey) => string, params: ScenarioParams): string {
  return `${t(METRIC_LABEL_KEYS[params.metric])} · ${t(METHOD_LABEL_KEYS[params.method])} · w=${params.prior_weight} · σ²=${params.obs_variance}`;
}

interface ScenariosPanelProps {
  current: ScenarioParams;
  onLoad: (params: ScenarioParams) => void;
}

/**
 * Only rendered while logged in -- login unlocks this panel and nothing
 * else, per CLAUDE.md. The panel captures whatever the dashboard's current
 * (metric, method, prior_weight, obs_variance) is at save time; it doesn't
 * own those values, App does, so loading a scenario just calls back up.
 */
export function ScenariosPanel({ current, onLoad }: ScenariosPanelProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { scenarios, isLoading, error, save, rename, remove } = useScenarios();
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (!user) return null;

  const startRename = (s: ScenarioOut) => {
    setRenamingId(s.id);
    setRenameValue(s.name);
  };

  const commitRename = (id: number) => {
    const name = renameValue.trim();
    if (name) rename.mutate({ id, name });
    setRenamingId(null);
  };

  const submitSave = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    save.mutate(
      { name, params: current },
      {
        onSuccess: () => setNewName(""),
      },
    );
  };

  return (
    <section className="panel">
      <h2>{t("scenarios.heading")}</h2>

      <form className={styles.saveRow} onSubmit={submitSave}>
        <input
          aria-label={t("scenarios.nameLabel")}
          placeholder={t("scenarios.namePlaceholder")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
          data-testid="scenario-name-input"
        />
        <button type="submit" disabled={!newName.trim() || save.isPending} data-testid="scenario-save-button">
          {t("scenarios.saveCurrent")}
        </button>
      </form>

      {error && <p className={styles.error}>{t("scenarios.failedToLoad")}</p>}
      {!error && isLoading && <p className={styles.empty}>{t("scenarios.loading")}</p>}
      {!error && !isLoading && scenarios.length === 0 && (
        <p className={styles.empty} data-testid="scenarios-empty">
          {t("scenarios.empty")}
        </p>
      )}

      <ul className={styles.list}>
        {scenarios.map((s) => (
          <li key={s.id} className={styles.row} data-testid={`scenario-row-${s.id}`}>
            {renamingId === s.id ? (
              <input
                aria-label={`${t("scenarios.renameLabelPrefix")} ${s.name}`}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(s.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => commitRename(s.id)}
                maxLength={100}
                data-testid={`scenario-rename-input-${s.id}`}
              />
            ) : (
              <div className={styles.name} data-testid={`scenario-name-${s.id}`}>
                {s.name}
                <div className={styles.summary}>{summarize(t, s.params)}</div>
              </div>
            )}
            <button type="button" onClick={() => onLoad(s.params)} data-testid={`scenario-load-${s.id}`}>
              {t("scenarios.load")}
            </button>
            <button type="button" onClick={() => startRename(s)} data-testid={`scenario-rename-btn-${s.id}`}>
              {t("scenarios.rename")}
            </button>
            <button
              type="button"
              onClick={() => remove.mutate(s.id)}
              disabled={remove.isPending}
              data-testid={`scenario-delete-${s.id}`}
            >
              {t("scenarios.delete")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

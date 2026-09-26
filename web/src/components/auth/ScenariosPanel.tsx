import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useScenarios, type ScenarioOut, type ScenarioParams } from "../../api/useScenarios";
import { useLocale } from "../../i18n/LocaleContext";
import { DemoAuthError } from "../../auth/browserBackend";
import { scenarioNamed, scenariosWithParams } from "./scenarioMatching";
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
  // Set when the name the visitor typed is already taken -- save or rename.
  const [nameError, setNameError] = useState<{ scope: "save" | number; name: string } | null>(null);
  // Set when the current settings are already saved under another name:
  // the save waits on the visitor's "Save anyway" rather than being refused.
  const [duplicateOf, setDuplicateOf] = useState<{ name: string; matches: string[] } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!user) return null;

  const errorText = (err: unknown) =>
    err instanceof DemoAuthError ? t(err.i18nKey) : err instanceof Error ? err.message : t("auth.genericError");

  const startRename = (s: ScenarioOut) => {
    setRenamingId(s.id);
    setRenameValue(s.name);
    setNameError(null);
  };

  const commitRename = (s: ScenarioOut) => {
    const name = renameValue.trim();
    if (!name || name === s.name) {
      setRenamingId(null);
      setNameError(null);
      return;
    }
    // Renaming only ever changes the label, never the four parameters, so
    // it can't create a settings duplicate -- only a name clash, which is
    // refused, same as on save.
    if (scenarioNamed(scenarios, name, s.id)) {
      setNameError({ scope: s.id, name });
      return;
    }
    setNameError(null);
    rename.mutate({ id: s.id, name }, { onError: (err) => setSaveError(errorText(err)) });
    setRenamingId(null);
  };

  const doSave = (name: string) => {
    setDuplicateOf(null);
    setSaveError(null);
    save.mutate(
      { name, params: current },
      {
        onSuccess: () => setNewName(""),
        onError: (err) => setSaveError(errorText(err)),
      },
    );
  };

  const submitSave = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    // A taken name is refused, not overwritten: overwriting would silently
    // destroy the settings saved under it, and two entries with one name
    // is never right. The database enforces the same rule.
    if (scenarioNamed(scenarios, name)) {
      setNameError({ scope: "save", name });
      setDuplicateOf(null);
      return;
    }
    setNameError(null);
    const matches = scenariosWithParams(scenarios, current);
    if (matches.length > 0) {
      setDuplicateOf({ name, matches: matches.map((m) => m.name) });
      return;
    }
    doSave(name);
  };

  const quoted = (names: string[]) => names.map((n) => t("scenarios.quoted", { name: n })).join(t("scenarios.listSeparator"));

  return (
    <section className="panel">
      <h2>{t("scenarios.heading")}</h2>

      <form className={styles.saveRow} onSubmit={submitSave}>
        <input
          aria-label={t("scenarios.nameLabel")}
          placeholder={t("scenarios.namePlaceholder")}
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setNameError(null);
            setDuplicateOf(null);
          }}
          maxLength={100}
          aria-invalid={nameError?.scope === "save" || undefined}
          aria-describedby={nameError?.scope === "save" ? "scenario-save-name-error" : undefined}
          data-testid="scenario-name-input"
        />
        <button type="submit" disabled={!newName.trim() || save.isPending} data-testid="scenario-save-button">
          {t("scenarios.saveCurrent")}
        </button>
      </form>

      {nameError?.scope === "save" && (
        <p className={styles.error} id="scenario-save-name-error" role="alert" data-testid="scenario-name-taken">
          {t("scenarios.nameTaken", { name: nameError.name })}
        </p>
      )}
      {duplicateOf && (
        <div className={styles.warning} role="alert" data-testid="scenario-duplicate-warning">
          <p>
            {t(duplicateOf.matches.length === 1 ? "scenarios.duplicateParams" : "scenarios.duplicateParamsMany", {
              names: quoted(duplicateOf.matches),
            })}{" "}
            <span className={styles.summaryInline}>{summarize(t, current)}</span>
          </p>
          <div className={styles.warningActions}>
            <button type="button" onClick={() => doSave(duplicateOf.name)} data-testid="scenario-save-anyway">
              {t("scenarios.saveAnyway")}
            </button>
            <button type="button" onClick={() => setDuplicateOf(null)} data-testid="scenario-save-cancel">
              {t("scenarios.cancel")}
            </button>
          </div>
        </div>
      )}
      {saveError && (
        <p className={styles.error} role="alert" data-testid="scenario-save-error">
          {saveError}
        </p>
      )}

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
              <div className={styles.renameField}>
                <input
                  aria-label={`${t("scenarios.renameLabelPrefix")} ${s.name}`}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setNameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(s);
                    if (e.key === "Escape") {
                      setRenamingId(null);
                      setNameError(null);
                    }
                  }}
                  onBlur={() => commitRename(s)}
                  maxLength={100}
                  aria-invalid={nameError?.scope === s.id || undefined}
                  aria-describedby={nameError?.scope === s.id ? `scenario-rename-error-${s.id}` : undefined}
                  data-testid={`scenario-rename-input-${s.id}`}
                />
                {nameError?.scope === s.id && (
                  <p
                    className={styles.error}
                    id={`scenario-rename-error-${s.id}`}
                    role="alert"
                    data-testid={`scenario-rename-taken-${s.id}`}
                  >
                    {t("scenarios.nameTaken", { name: nameError.name })}
                  </p>
                )}
              </div>
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

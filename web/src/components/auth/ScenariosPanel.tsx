import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useScenarios, type ScenarioOut, type ScenarioParams } from "../../api/useScenarios";
import styles from "./ScenariosPanel.module.css";

const METRIC_LABELS: Record<ScenarioParams["metric"], string> = { xg: "xG", xgd: "xGD", gd: "GD", points: "Points" };
const METHOD_LABELS: Record<ScenarioParams["method"], string> = { pooled: "pooled", per_season: "per-season" };

function summarize(params: ScenarioParams): string {
  return `${METRIC_LABELS[params.metric]} · ${METHOD_LABELS[params.method]} · w=${params.prior_weight} · σ²=${params.obs_variance}`;
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
      <h2>Saved scenarios</h2>

      <form className={styles.saveRow} onSubmit={submitSave}>
        <input
          aria-label="scenario name"
          placeholder="name this scenario…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
        />
        <button type="submit" disabled={!newName.trim() || save.isPending}>
          Save current
        </button>
      </form>

      {error && <p className={styles.error}>failed to load scenarios</p>}
      {!error && isLoading && <p className={styles.empty}>loading…</p>}
      {!error && !isLoading && scenarios.length === 0 && <p className={styles.empty}>no saved scenarios yet</p>}

      <ul className={styles.list}>
        {scenarios.map((s) => (
          <li key={s.id} className={styles.row}>
            {renamingId === s.id ? (
              <input
                aria-label={`rename ${s.name}`}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(s.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => commitRename(s.id)}
                maxLength={100}
              />
            ) : (
              <div className={styles.name}>
                {s.name}
                <div className={styles.summary}>{summarize(s.params)}</div>
              </div>
            )}
            <button type="button" onClick={() => onLoad(s.params)}>
              Load
            </button>
            <button type="button" onClick={() => startRename(s)}>
              Rename
            </button>
            <button type="button" onClick={() => remove.mutate(s.id)} disabled={remove.isPending}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { TranslationKey } from "./i18n/dictionaries";
import type { Metric } from "./ws/types";

export const METRIC_LABEL_KEYS: Record<Metric, TranslationKey> = {
  xg: "replay.metric.xg",
  xgd: "replay.metric.xgd",
  gd: "replay.metric.gd",
  points: "replay.metric.points",
};

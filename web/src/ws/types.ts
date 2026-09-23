import type { components } from "../api/schema";

export type TableRow = components["schemas"]["TableRow"];
export type Metric = components["schemas"]["CurvesOut"]["metric"];

export const METRICS: Metric[] = ["xg", "xgd", "gd", "points"];

export interface RoundMetric {
  rmse: number;
  mae: number;
  r2: number;
  prior_rmse: number;
  crossover_passed: boolean;
}

export interface InitFrame {
  type: "init";
  pair_id: number;
  total_frames: number;
}

export interface MatchFrame {
  type: "match";
  seq: number;
  match_number: number;
  played_at: string;
  table: TableRow[];
}

export interface RoundFrame {
  type: "round";
  seq: number;
  games: number;
  weights: { prior: number; data: number };
  metrics: Record<Metric, RoundMetric>;
}

export interface DoneFrame {
  type: "done";
}

export interface ErrorFrame {
  type: "error";
  message: string;
}

export type ReplayFrame = InitFrame | MatchFrame | RoundFrame | DoneFrame | ErrorFrame;

export type ReplayCommand =
  | { cmd: "play"; speed: number }
  | { cmd: "pause" }
  | { cmd: "seek"; seq: number };

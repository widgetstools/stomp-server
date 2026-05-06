export interface AppConfig {
  port: number;
  nodeEnv: string;
  /** Rows delivered in snapshot unless overridden by STOMP header `snapshot-rows` */
  defaultSnapshotRows: number;
  minSnapshotRows: number;
  maxSnapshotRows: number;
  /** Verbose STOMP / per-tick logging */
  debug: boolean;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 8081);
  const rawDefault = Number(process.env.DEFAULT_SNAPSHOT_ROWS ?? 20_000);
  const rawMin = Number(process.env.MIN_SNAPSHOT_ROWS ?? 1_000);
  const rawMax = Number(process.env.MAX_SNAPSHOT_ROWS ?? 20_000);

  const minSnapshotRows = Number.isFinite(rawMin) ? rawMin : 1_000;
  const maxSnapshotRows = Number.isFinite(rawMax)
    ? Math.max(minSnapshotRows, rawMax)
    : Math.max(minSnapshotRows, 20_000);
  const defaultSnapshotRows = clamp(
    Number.isFinite(rawDefault) ? rawDefault : 20_000,
    minSnapshotRows,
    maxSnapshotRows,
  );

  return {
    port: Number.isFinite(port) ? port : 8081,
    nodeEnv: process.env.NODE_ENV ?? "development",
    defaultSnapshotRows,
    minSnapshotRows,
    maxSnapshotRows,
    debug: process.env.DEBUG === "1" || process.env.DEBUG === "true",
  };
}

export function clampSnapshotRows(
  config: AppConfig,
  requested: number | undefined,
): number {
  const lo = Math.max(1, config.minSnapshotRows);
  const hi = Math.max(lo, config.maxSnapshotRows);
  const raw = requested ?? config.defaultSnapshotRows;
  if (!Number.isFinite(raw)) return clamp(config.defaultSnapshotRows, lo, hi);
  return clamp(Math.floor(raw), lo, hi);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Chart Service TypeScript Definitions
 */

// ─── Chart Dataset ──────────────────────────────────────────────

export interface ChartDataset {
  label?: string;
  /**
   * Plain numbers for most types; per-point arrays for scatter ([x, y])
   * and candlestick ([open, close, low, high]).
   */
  data: (number | number[])[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  tension?: number;
  fill?: boolean;
  pointRadius?: number;
  pointHoverRadius?: number;
  borderRadius?: number;
}

// ─── Chart Configuration ────────────────────────────────────────

export interface ChartConfig {
  type: string;
  title?: string;
  labels: string[];
  datasets: ChartDataset[];
  options?: Record<string, unknown>;
}

// ─── Chart Store Entry ──────────────────────────────────────────

export interface ChartStoreEntry {
  config: ChartConfig;
  createdAt: number;
}

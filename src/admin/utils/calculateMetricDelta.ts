/**
 * Calculate metric delta for trend displays.
 */
export interface MetricDeltaResult {
  value: number;
  label: string;
  isPositive: boolean;
  isNegative: boolean;
  isNeutral: boolean;
}

export function calculateMetricDelta(
  current: number,
  previous: number,
  options?: { invertNegative?: boolean }
): MetricDeltaResult {
  if (previous === 0) {
    const value = current > 0 ? 100 : 0;
    return {
      value,
      label: value > 0 ? `+${value}%` : "0%",
      isPositive: value > 0,
      isNegative: false,
      isNeutral: value === 0,
    };
  }
  const delta = ((current - previous) / previous) * 100;
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const label = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  return {
    value: Math.abs(delta),
    label,
    isPositive: options?.invertNegative ? isNegative : isPositive,
    isNegative: options?.invertNegative ? isPositive : isNegative,
    isNeutral: delta === 0,
  };
}

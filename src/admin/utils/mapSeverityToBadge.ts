/**
 * Map severity to badge styling for admin dashboard.
 */
export type Severity = "critical" | "warning" | "healthy" | "info";

export function mapSeverityToBadge(severity: Severity): {
  className: string;
  dotClassName: string;
} {
  switch (severity) {
    case "critical":
      return {
        className:
          "rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300",
        dotClassName: "bg-red-500",
      };
    case "warning":
      return {
        className:
          "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        dotClassName: "bg-amber-500",
      };
    case "healthy":
      return {
        className:
          "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
        dotClassName: "bg-emerald-500",
      };
    case "info":
    default:
      return {
        className:
          "rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
        dotClassName: "bg-blue-500",
      };
  }
}

import type { EnterpriseThemeId } from "@/types/enterprise";
import { getThemeVariables, getThemeVariablesFromPrimaryHex } from "@/lib/enterprise-themes";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * Resolves --enterprise-primary / --enterprise-accent for a dashboard workspace.
 * Device-local button color wins; then preset ui theme override; then inherited org/team id.
 */
export function resolveDashboardChromeThemeVariables(
  inheritedThemeId: EnterpriseThemeId,
  buttonColor: string | null,
  uiThemeOverride: EnterpriseThemeId | null,
): Record<string, string> {
  if (buttonColor && HEX6.test(buttonColor)) {
    return getThemeVariablesFromPrimaryHex(buttonColor);
  }
  const id = uiThemeOverride ?? inheritedThemeId;
  return getThemeVariables(id);
}

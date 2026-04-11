/**
 * Single source of truth for recurring subscription / settings vocabulary.
 * Use these exports in UI so labels stay consistent (personal team vs org, etc.).
 */

export const productSettingsCopy = {
  basePlan: {
    label: "Base plan",
    shortLabel: "Plan",
  },
  powerUps: {
    label: "Power Ups",
    helper:
      "Power Ups add capabilities (galleries, cloud editing, and more) on top of your base plan.",
  },
  storageAddons: {
    label: "Storage add-ons",
    helper: "Extra storage you can add to qualifying paid plans after you subscribe.",
  },
  personalTeamSeats: {
    label: "Personal team seats",
    shortLabel: "Personal team seats",
    helper:
      "Extra seats on your personal subscription for collaborators—not the same as organization seats.",
    notInCheckoutTitle: "Personal team seats: Not included in this checkout",
    addLaterLine: "You can add seats later in Settings or Change Plan",
    collaboratorsExplainer:
      "Need collaboration seats? Personal team seats can be added after you continue below—then manage them anytime in Settings or Change Plan.",
  },
  organizationSeats: {
    label: "Organization seats",
    helper: "Seats for your enterprise workspace—managed in Enterprise, not in personal Settings.",
  },
  changePlan: {
    label: "Change Plan",
    pathLabel: "Change Plan",
  },
  settings: {
    label: "Settings",
    pathLabel: "Settings",
  },
  billing: {
    subscriptionAndBilling: "Subscription and Billing",
    whatYouCanChangeLater: "What you can change later",
  },
  scopes: {
    personalAccountOnly: "Personal account only",
    thisTeamWorkspaceOnly: "This personal team workspace only",
    organizationWide: "Organization-wide",
    thisGalleryOnly: "This gallery only",
    localDeviceWorkspace:
      "Local to this device and browser (this workspace view)",
  },
  localDashboard: {
    movedTitle: "Dashboard appearance has moved",
    movedBody:
      "Use Customize dashboard in Quick access to edit colors, background, and how this workspace looks on this device.",
  },
} as const;

export type SettingsPermissionBadge =
  | "editable"
  | "ownerOnly"
  | "adminOnly"
  | "readOnly"
  | "memberView";

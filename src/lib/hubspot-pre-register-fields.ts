import { splitFullName } from "@/lib/split-full-name";
import type { PreRegistrationPayload } from "@/lib/pre-registration-schema";

/**
 * HubSpot form `fields[].name` values — MUST match your HubSpot form / contact property
 * internal names exactly or submissions will fail. Create matching properties in HubSpot
 * (Settings → Properties → Contact) and the pre-reg form, then align these constants before go-live.
 */
export const HS = {
  firstname: "firstname",
  lastname: "lastname",
  email: "email",
  phone: "phone",
  website: "website",
  /** Single-line text — social handle or profile URL */
  socialProfile: "bizzi_pr_social_profile",
  /** Single-line — sent as display string e.g. "5 TB" */
  tbNeeded: "bizzi_pr_tb_needed",
  /** Semicolon-separated list of selected features */
  excitedFeatures: "bizzi_pr_excited_features",
  currentCloudProvider: "bizzi_pr_current_cloud_provider",
  otherProvider: "bizzi_pr_other_cloud_provider",
  currentSpend: "bizzi_pr_current_cloud_spend",
  /** Source / campaign label for CRM segmentation */
  leadSource: "bizzi_pr_lead_source",
} as const;

export type HubSpotFormField = { name: string; value: string };

export function buildHubSpotFields(
  data: PreRegistrationPayload,
  leadSource: string,
): HubSpotFormField[] {
  const { firstname, lastname } = splitFullName(data.fullName);
  const fields: HubSpotFormField[] = [
    { name: HS.firstname, value: firstname },
    { name: HS.lastname, value: lastname },
    { name: HS.email, value: data.email },
    { name: HS.phone, value: data.phone },
    { name: HS.tbNeeded, value: data.tbNeeded },
    { name: HS.currentCloudProvider, value: data.currentCloudProvider },
    { name: HS.leadSource, value: leadSource },
  ];
  if (data.website) fields.push({ name: HS.website, value: data.website });
  if (data.socialProfile) fields.push({ name: HS.socialProfile, value: data.socialProfile });
  if (data.excitedFeatures.length > 0) {
    fields.push({ name: HS.excitedFeatures, value: data.excitedFeatures.join("; ") });
  }
  if (data.currentCloudProvider === "Other" && data.otherProvider) {
    fields.push({ name: HS.otherProvider, value: data.otherProvider });
  }
  if (data.currentSpend) fields.push({ name: HS.currentSpend, value: data.currentSpend });
  return fields;
}

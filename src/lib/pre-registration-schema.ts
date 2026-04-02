import { z } from "zod";

export const TB_NEED_OPTIONS = [
  "1 TB",
  "2 TB",
  "5 TB",
  "10 TB",
  "15 TB+",
] as const;

export const CURRENT_CLOUD_PROVIDERS = [
  "Dropbox",
  "Google Drive",
  "Frame.io",
  "Pixieset",
  "Other",
] as const;

export const CREATOR_TYPE_OPTIONS = [
  "Photographer",
  "Filmmaker",
  "Content creator",
  "Hybrid shooter",
] as const;

export const EXCITED_FEATURE_OPTIONS = [
  "Photo & Video Galleries",
  "Virtual SSD Mounting",
  "Instant Transfers",
  "Custom LUT Preview",
  "An all in one cloud storage platform",
] as const;

/** Team size on waitlist: solo through 10 (numeric strings match headcount beyond “Just Me”). */
export const TEAM_SIZE_OPTIONS = [
  "Just Me",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

export const preRegistrationBodySchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(200),
    email: z.string().trim().email("Enter a valid email"),
    phone: z
      .string()
      .trim()
      .min(7, "Enter a valid phone number")
      .max(40, "Phone number is too long"),
    socialProfile: z
      .string()
      .trim()
      .min(2, "Enter your social profile or URL")
      .max(500),
    creatorType: z.enum(CREATOR_TYPE_OPTIONS, {
      errorMap: () => ({ message: "Select what type of creator you are" }),
    }),
    tbNeeded: z.enum(TB_NEED_OPTIONS, {
      errorMap: () => ({ message: "Select how much storage you need" }),
    }),
    excitedFeatures: z
      .array(z.enum(EXCITED_FEATURE_OPTIONS))
      .min(1, "Select at least one thing you’re excited about in Bizzi Cloud"),
    currentCloudProvider: z.enum(CURRENT_CLOUD_PROVIDERS, {
      errorMap: () => ({ message: "Select your current cloud provider" }),
    }),
    otherProvider: z
      .string()
      .max(200)
      .optional()
      .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim())),
    currentSpend: z
      .string()
      .trim()
      .min(1, "Enter how much you pay for cloud storage")
      .max(200),
    teamSize: z.enum(TEAM_SIZE_OPTIONS, {
      errorMap: () => ({ message: "Select how many people are on your team" }),
    }),
    /** Browser cookie `hubspotutk` — forwarded to HubSpot Forms API as `context.hutk`. */
    hubspotUtk: z
      .string()
      .max(300)
      .optional()
      .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim())),
  })
  .superRefine((data, ctx) => {
    if (data.currentCloudProvider === "Other" && !data.otherProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otherProvider"],
        message: "Please name your cloud provider",
      });
    }
  });

export type PreRegistrationPayload = z.infer<typeof preRegistrationBodySchema>;

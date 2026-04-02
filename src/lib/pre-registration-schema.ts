import { z } from "zod";

export const TB_NEED_OPTIONS = [
  "Less than 1 TB",
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
  "OneDrive",
  "Other",
] as const;

export const EXCITED_FEATURE_OPTIONS = [
  "Photo & Video Gallery",
  "Bizzi Editor",
  "Instant Transfers",
  "Virtual NLE Mount",
  "Custom LUT Preview",
  "EVERYTHING",
] as const;

const optionalUrl = z.preprocess(
  (v) => {
    if (v === "" || v == null) return undefined;
    return String(v).trim().slice(0, 2048);
  },
  z.union([z.undefined(), z.string().url({ message: "Enter a valid URL (include https://)" })]),
);

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
      .max(500)
      .optional()
      .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim())),
    website: optionalUrl,
    tbNeeded: z.enum(TB_NEED_OPTIONS, {
      errorMap: () => ({ message: "Select how much storage you need" }),
    }),
    excitedFeatures: z
      .array(z.enum(EXCITED_FEATURE_OPTIONS))
      .optional()
      .default([]),
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
      .max(200)
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

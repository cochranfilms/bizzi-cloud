/**
 * Support ticket domain: statuses, validation, and shared copy.
 * Firestore docs may still contain legacy `priority`; new writes omit it.
 */

export const SUPPORT_CONTACT_EMAIL = "hello@bizzicloud.io" as const;

export const SUPPORT_TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export function isSupportTicketStatus(s: unknown): s is SupportTicketStatus {
  return typeof s === "string" && SUPPORT_TICKET_STATUSES.includes(s as SupportTicketStatus);
}

export const SUPPORT_ISSUE_TYPES = [
  "billing",
  "upload",
  "storage",
  "account",
  "preview",
  "other",
] as const;
export type SupportIssueType = (typeof SUPPORT_ISSUE_TYPES)[number];

export function isSupportIssueType(s: unknown): s is SupportIssueType {
  return typeof s === "string" && SUPPORT_ISSUE_TYPES.includes(s as SupportIssueType);
}

export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_MESSAGE_MIN = 10;
export const SUPPORT_MESSAGE_MAX = 2000;
export const SUPPORT_SUBJECT_META_MAX = 80;

/** Submissions per rolling window (see submit route). */
export const SUPPORT_SUBMIT_RATE_LIMIT_MAX = 3;
export const SUPPORT_SUBMIT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export type SupportStatusHistoryEntry = {
  status: SupportTicketStatus;
  changedAt: string;
  changedBy: string;
};

export type SupportNotificationContext = "submitted" | "in_progress" | "resolved";

export function truncateSupportSubject(
  subject: string,
  maxLen = SUPPORT_SUBJECT_META_MAX
): string {
  const t = subject.trim();
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

export function supportNotificationContextForType(
  type:
    | "support_ticket_submitted"
    | "support_ticket_in_progress"
    | "support_ticket_resolved"
): SupportNotificationContext {
  switch (type) {
    case "support_ticket_submitted":
      return "submitted";
    case "support_ticket_in_progress":
      return "in_progress";
    case "support_ticket_resolved":
      return "resolved";
  }
}

export function supportContextBannerMessage(
  ctx: SupportNotificationContext | null | undefined
): string | null {
  switch (ctx) {
    case "submitted":
      return "Your support request has been received.";
    case "in_progress":
      return "Support is working on your request.";
    case "resolved":
      return "A support request was marked resolved.";
    default:
      return null;
  }
}

export type ParsedSupportSubmitBody = {
  subject: string;
  message: string;
  issueType: SupportIssueType;
};

/**
 * Trim outer whitespace on subject/message; validate lengths and issue type.
 */
export function parseSupportSubmitBody(body: unknown):
  | { ok: true; data: ParsedSupportSubmitBody }
  | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const b = body as Record<string, unknown>;
  const subjectRaw = typeof b.subject === "string" ? b.subject : "";
  const messageRaw = typeof b.message === "string" ? b.message : "";
  const subject = subjectRaw.trim();
  const message = messageRaw.trim();
  const issueType: SupportIssueType = isSupportIssueType(b.issueType)
    ? b.issueType
    : "other";

  if (!subject || subject.length < SUPPORT_SUBJECT_MIN) {
    return { ok: false, error: "Subject must be at least 3 characters" };
  }
  if (subject.length > SUPPORT_SUBJECT_MAX) {
    return { ok: false, error: `Subject must be at most ${SUPPORT_SUBJECT_MAX} characters` };
  }
  if (!message || message.length < SUPPORT_MESSAGE_MIN) {
    return { ok: false, error: "Message must be at least 10 characters" };
  }
  if (message.length > SUPPORT_MESSAGE_MAX) {
    return { ok: false, error: `Message must be at most ${SUPPORT_MESSAGE_MAX} characters` };
  }

  return { ok: true, data: { subject, message, issueType } };
}

/** Normalize status from Firestore for admin PATCH / reads. */
export function normalizeTicketStatus(raw: unknown): SupportTicketStatus {
  return isSupportTicketStatus(raw) ? raw : "open";
}

export function parseSupportContextParam(
  raw: string | null
): SupportNotificationContext | null {
  if (raw === "submitted" || raw === "in_progress" || raw === "resolved") return raw;
  return null;
}

/** Settings Help deep link from notification bell (dashboard / enterprise / desktop base path). */
export function supportSettingsHelpHref(
  shareBasePath: string,
  type:
    | "support_ticket_submitted"
    | "support_ticket_in_progress"
    | "support_ticket_resolved"
): string {
  const ctx = supportNotificationContextForType(type);
  return `${shareBasePath}/settings?section=help&supportContext=${encodeURIComponent(ctx)}`;
}

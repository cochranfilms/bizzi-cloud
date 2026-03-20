/**
 * EmailJS server-side helpers for enterprise invite flow and file sharing.
 * Enterprise: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_INVOICE, EMAILJS_TEMPLATE_ID_SIGNUP,
 *   EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 * Share emails: EMAILJS_TEMPLATE_ID_SHARE (optional; when set, share notifications send email)
 */

import emailjs from "@emailjs/nodejs";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getFileDisplayNames } from "@/lib/file-access";

function getConfig() {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateInvoice = process.env.EMAILJS_TEMPLATE_ID_INVOICE;
  const templateSignup = process.env.EMAILJS_TEMPLATE_ID_SIGNUP;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateInvoice || !templateSignup || !publicKey) {
    throw new Error(
      "EmailJS not configured: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_INVOICE, EMAILJS_TEMPLATE_ID_SIGNUP, EMAILJS_PUBLIC_KEY required"
    );
  }

  return {
    serviceId,
    templateInvoice,
    templateSignup,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getShareConfig(): {
  serviceId: string;
  templateShare: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateShare = process.env.EMAILJS_TEMPLATE_ID_SHARE;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateShare || !publicKey) return null;
  return {
    serviceId,
    templateShare,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

/** Default logo URL for emails (Bizzi Byte logo) */
export function getEmailLogoUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io";
  return `${base}/bizzi-byte-logo.png`;
}

/** Base URL for share links */
function getShareBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io"
  );
}

export interface InvoiceEmailParams {
  to_email: string;
  org_name: string;
  invoice_url: string;
  amount: string;
  storage_line: string;
  seats_line: string;
  /** Optional line for power-up add-ons (e.g. "Bizzi Editor — $10/mo") */
  addons_line?: string;
}

/**
 * Send invoice email to organization owner.
 * Template params: to_email, org_name, invoice_url, amount, storage_line, seats_line, logo_url
 */
export async function sendInvoiceEmail(params: InvoiceEmailParams): Promise<void> {
  const config = getConfig();
  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateInvoice,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface SignupLinkEmailParams {
  to_email: string;
  org_name: string;
  invite_url: string;
}

/**
 * Send sign-up link email after invoice is paid.
 * Template params: to_email, org_name, invite_url, logo_url
 */
export async function sendSignupLinkEmail(
  params: SignupLinkEmailParams
): Promise<void> {
  const config = getConfig();
  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateSignup,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface ShareFileEmailParams {
  to_email: string;
  sender_name: string;
  /** Profile photo URL; fallback to avatar placeholder if empty */
  sender_photo_url: string;
  /** HTML list of file names (e.g. "<ul><li>file1.pdf</li></ul>") */
  file_names_html: string;
  /** Display title for the share (folder name or "files") */
  share_title: string;
  /** Full URL to the shared content */
  share_url: string;
}

/**
 * Send share notification email when a user shares files/folders with another user.
 * Requires EMAILJS_TEMPLATE_ID_SHARE. If not set, does nothing (no-op).
 * Template params: to_email, sender_name, sender_photo_url, file_names_html, share_title, share_url, logo_url
 */
export async function sendShareFileEmail(params: ShareFileEmailParams): Promise<void> {
  const config = getShareConfig();
  if (!config) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateShare,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

/** Avatar placeholder when user has no profile photo (initials-based) */
function getAvatarPlaceholder(name: string): string {
  const init = (name || "U").charAt(0).toUpperCase();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(init)}&background=00BFFF&color=fff&size=112`;
}

export interface SendShareEmailsParams {
  invitedEmails: string[];
  sharedByUserId: string;
  actorDisplayName: string;
  fileIds: string[];
  folderName: string;
  shareToken: string;
}

/**
 * Send share notification emails to all invited recipients.
 * No-op if EMAILJS_TEMPLATE_ID_SHARE is not set.
 * Runs asynchronously; errors are logged but do not throw.
 */
export async function sendShareFileEmailsToInvitees(
  params: SendShareEmailsParams
): Promise<void> {
  if (!getShareConfig() || params.invitedEmails.length === 0) return;

  let senderPhotoUrl: string;
  try {
    const authUser = await getAdminAuth().getUser(params.sharedByUserId);
    senderPhotoUrl =
      (authUser.photoURL as string) ??
      getAvatarPlaceholder(params.actorDisplayName);
  } catch {
    senderPhotoUrl = getAvatarPlaceholder(params.actorDisplayName);
  }

  const fileNames =
    params.fileIds.length > 0
      ? await getFileDisplayNames(params.fileIds)
      : [];
  const totalCount = params.fileIds.length;
  const fileNamesHtml =
    fileNames.length > 0
      ? `<ul>${fileNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}${
          totalCount > fileNames.length
            ? `<li><em>…and ${totalCount - fileNames.length} more</em></li>`
            : ""
        }</ul>`
      : `<p><em>${escapeHtml(params.folderName)}</em></p>`;

  const shareTitle =
    params.fileIds.length <= 1 && params.folderName
      ? params.folderName
      : params.fileIds.length > 1
        ? `${params.fileIds.length} files`
        : params.folderName || "files";

  const shareUrl = `${getShareBaseUrl()}/s/${params.shareToken}`;

  const sendParams: Omit<ShareFileEmailParams, "to_email"> = {
    sender_name: params.actorDisplayName,
    sender_photo_url: senderPhotoUrl,
    file_names_html: fileNamesHtml,
    share_title: shareTitle,
    share_url: shareUrl,
  };

  await Promise.allSettled(
    params.invitedEmails.map((toEmail) =>
      sendShareFileEmail({ ...sendParams, to_email: toEmail })
    )
  ).catch((err) => {
    console.error("[EmailJS] Share email batch error:", err);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

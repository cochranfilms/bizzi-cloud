/**
 * EmailJS server-side helpers for enterprise invite flow, file sharing, and transfers.
 * Enterprise: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_INVOICE, EMAILJS_TEMPLATE_ID_SIGNUP,
 *   EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 * Share emails: EMAILJS_TEMPLATE_ID_SHARE (optional; when set, share notifications send email)
 * Transfer emails: EMAILJS_TEMPLATE_ID_TRANSFER (optional; when set, transfer emails sent to client)
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

function getTransferConfig(): {
  serviceId: string;
  templateTransfer: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateTransfer = process.env.EMAILJS_TEMPLATE_ID_TRANSFER;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateTransfer || !publicKey) return null;
  return {
    serviceId,
    templateTransfer,
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

export interface TransferEmailParams {
  to_email: string;
  sender_name: string;
  /** Profile photo URL; fallback to avatar placeholder if empty */
  sender_photo_url: string;
  /** HTML list of file names (e.g. "<ul><li>file1.pdf</li></ul>") */
  file_names_html: string;
  /** Display title for the transfer (e.g. transfer name) */
  transfer_title: string;
  /** Full URL to the transfer */
  transfer_url: string;
}

export interface SendTransferEmailParams {
  clientEmail: string;
  sharedByUserId: string;
  actorDisplayName: string;
  transferName: string;
  transferSlug: string;
  fileNames: string[];
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

/**
 * Send transfer notification email when a user creates a transfer and enters client email.
 * Requires EMAILJS_TEMPLATE_ID_TRANSFER. If not set, does nothing (no-op).
 * Template params: to_email, sender_name, sender_photo_url, file_names_html, transfer_title, transfer_url, logo_url
 */
export async function sendTransferEmail(params: TransferEmailParams): Promise<void> {
  const config = getTransferConfig();
  if (!config) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateTransfer,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

/**
 * Send transfer notification email to the client when a transfer is created.
 * No-op if EMAILJS_TEMPLATE_ID_TRANSFER is not set or clientEmail is empty.
 * Runs asynchronously; errors are logged but do not throw.
 */
export async function sendTransferEmailToClient(
  params: SendTransferEmailParams
): Promise<void> {
  if (!getTransferConfig() || !params.clientEmail?.trim()) return;

  let senderPhotoUrl: string;
  try {
    const authUser = await getAdminAuth().getUser(params.sharedByUserId);
    senderPhotoUrl =
      (authUser.photoURL as string) ??
      getAvatarPlaceholder(params.actorDisplayName);
  } catch {
    senderPhotoUrl = getAvatarPlaceholder(params.actorDisplayName);
  }

  const fileNamesHtml =
    params.fileNames.length > 0
      ? `<ul>${params.fileNames
          .slice(0, 20)
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}${
          params.fileNames.length > 20
            ? `<li><em>…and ${params.fileNames.length - 20} more</em></li>`
            : ""
        }</ul>`
      : `<p><em>${escapeHtml(params.transferName)}</em></p>`;

  const transferUrl = `${getShareBaseUrl()}/t/${params.transferSlug}`;

  try {
    await sendTransferEmail({
      to_email: params.clientEmail.trim(),
      sender_name: params.actorDisplayName,
      sender_photo_url: senderPhotoUrl,
      file_names_html: fileNamesHtml,
      transfer_title: params.transferName,
      transfer_url: transferUrl,
    });
  } catch (err) {
    console.error("[EmailJS] Transfer email error:", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

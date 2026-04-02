/**
 * EmailJS server-side helpers for enterprise invite flow, file sharing, transfers, and gallery invites.
 * Enterprise: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_INVOICE, EMAILJS_TEMPLATE_ID_SIGNUP,
 *   EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 * Share emails: EMAILJS_TEMPLATE_ID_SHARE (optional; when set, share notifications send email)
 * Workspace share (team/org admin): EMAILJS_TEMPLATE_ID_SHARE_WORKSPACE (optional)
 * Transfer emails: EMAILJS_TEMPLATE_ID_TRANSFER (optional; when set, transfer emails sent to client)
 * Subscription welcome: EMAILJS_TEMPLATE_ID_SUBSCRIPTION_WELCOME (optional; when set, welcome email on purchase)
 * Gallery invite: EMAILJS_TEMPLATE_ID_GALLERY_INVITE (optional; when set, invite emails sent when creating invite-only galleries)
 * Org seat invite: EMAILJS_TEMPLATE_ID_ORG_SEAT_INVITE (optional; when set, invite email sent when org admin invites member)
 * Personal team invite: EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE (optional; when set, email sent for personal-account team invites)
 * Subscription change receipt: EMAILJS_TEMPLATE_ID_SUBSCRIPTION_CHANGE_RECEIPT (optional; itemized receipt after in-app plan/seat changes)
 * Waitlist: EMAILJS_TEMPLATE_ID_WAITLIST_ADMIN, EMAILJS_TEMPLATE_ID_WAITLIST_CLIENT, WAITLIST_ADMIN_NOTIFY_EMAIL
 */

import emailjs from "@emailjs/nodejs";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getFileDisplayNames } from "@/lib/file-access";
import { getPreferredGalleryShareAbsoluteUrl } from "@/lib/gallery-share-url";

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

function getShareWorkspaceConfig(): {
  serviceId: string;
  templateShareWorkspace: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateShareWorkspace = process.env.EMAILJS_TEMPLATE_ID_SHARE_WORKSPACE;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateShareWorkspace || !publicKey) return null;
  return {
    serviceId,
    templateShareWorkspace,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

export interface ShareWorkspaceAdminEmailParams {
  to_email: string;
  sender_name: string;
  sender_photo_url: string;
  file_names_html: string;
  share_title: string;
  share_url: string;
  scope_label: string;
  workspace_name: string;
  cta_url: string;
  /** Inbox route + source drive (optional; empty string if unused in template) */
  share_context_detail?: string;
}

/**
 * Notify org/team admin when content is shared with a workspace.
 * Requires EMAILJS_TEMPLATE_ID_SHARE_WORKSPACE. No-op if unset.
 */
export async function sendShareWorkspaceEmailToAdmin(
  params: ShareWorkspaceAdminEmailParams
): Promise<void> {
  const config = getShareWorkspaceConfig();
  if (!config || !params.to_email?.trim()) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateShareWorkspace,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
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

function getSubscriptionWelcomeConfig(): {
  serviceId: string;
  templateSubscriptionWelcome: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateSubscriptionWelcome = process.env.EMAILJS_TEMPLATE_ID_SUBSCRIPTION_WELCOME;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateSubscriptionWelcome || !publicKey) return null;
  return {
    serviceId,
    templateSubscriptionWelcome,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getSubscriptionChangeReceiptConfig(): {
  serviceId: string;
  templateSubscriptionChangeReceipt: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateSubscriptionChangeReceipt =
    process.env.EMAILJS_TEMPLATE_ID_SUBSCRIPTION_CHANGE_RECEIPT;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateSubscriptionChangeReceipt || !publicKey) return null;
  return {
    serviceId,
    templateSubscriptionChangeReceipt,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getGalleryInviteConfig(): {
  serviceId: string;
  templateGalleryInvite: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateGalleryInvite = process.env.EMAILJS_TEMPLATE_ID_GALLERY_INVITE;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateGalleryInvite || !publicKey) return null;
  return {
    serviceId,
    templateGalleryInvite,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getSupportTicketConfig(): {
  serviceId: string;
  templateSupport: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateSupport = process.env.EMAILJS_TEMPLATE_ID_SUPPORT;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateSupport || !publicKey) return null;
  return {
    serviceId,
    templateSupport,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getSupportTicketConfirmationConfig(): {
  serviceId: string;
  templateConfirmation: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateConfirmation = process.env.EMAILJS_TEMPLATE_ID_SUPPORT_CONFIRMATION;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateConfirmation || !publicKey) return null;
  return {
    serviceId,
    templateConfirmation,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getOrgSeatInviteConfig(): {
  serviceId: string;
  templateOrgSeatInvite: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateOrgSeatInvite = process.env.EMAILJS_TEMPLATE_ID_ORG_SEAT_INVITE;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateOrgSeatInvite || !publicKey) return null;
  return {
    serviceId,
    templateOrgSeatInvite,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getPersonalTeamInviteConfig(): {
  serviceId: string;
  templatePersonalTeamInvite: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templatePersonalTeamInvite =
    process.env.EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templatePersonalTeamInvite || !publicKey) return null;
  return {
    serviceId,
    templatePersonalTeamInvite,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getOrgRemovalConfig(): {
  serviceId: string;
  templateOwner: string;
  templateMember: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateOwner = process.env.EMAILJS_TEMPLATE_ID_ORG_REMOVAL_OWNER;
  const templateMember = process.env.EMAILJS_TEMPLATE_ID_ORG_REMOVAL_MEMBER;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateOwner || !templateMember || !publicKey) return null;
  return {
    serviceId,
    templateOwner,
    templateMember,
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

export interface OrgSeatInviteEmailParams {
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

/**
 * Send organization seat invite email when admin invites a member by email.
 * Requires EMAILJS_TEMPLATE_ID_ORG_SEAT_INVITE. If not set, does nothing (no-op).
 * Template params: to_email, org_name, invite_url, logo_url
 */
export async function sendOrgSeatInviteEmail(
  params: OrgSeatInviteEmailParams
): Promise<void> {
  const config = getOrgSeatInviteConfig();
  if (!config) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateOrgSeatInvite,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface PersonalTeamInviteEmailParams {
  to_email: string;
  inviter_name: string;
  seat_access_label: string;
  what_they_get: string;
  cta_url: string;
  cta_label: string;
}

/**
 * Personal-account team invite (not Organization).
 * Requires EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE. If not set, logs and skips.
 * Template params: to_email, inviter_name, seat_access_label, what_they_get, cta_url, cta_label, logo_url
 */
export async function sendPersonalTeamInviteEmail(
  params: PersonalTeamInviteEmailParams
): Promise<void> {
  const config = getPersonalTeamInviteConfig();
  if (!config) {
    console.warn(
      "[EmailJS] Personal team invite skipped: EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE not set"
    );
    return;
  }

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templatePersonalTeamInvite,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface OrgRemovalOwnerEmailParams {
  to_email: string;
  org_name: string;
  deadline_date: string;
  support_url: string;
  grace_days: string;
}

export interface OrgRemovalMemberEmailParams {
  to_email: string;
  org_name: string;
  deadline_date: string;
  support_url: string;
  grace_days: string;
}

/** Send org removal notice to organization owner (detailed). */
export async function sendOrgRemovalOwnerEmail(
  params: OrgRemovalOwnerEmailParams
): Promise<void> {
  const config = getOrgRemovalConfig();
  if (!config) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateOwner,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

/** Send org removal notice to seat members (short alert). */
export async function sendOrgRemovalMemberEmail(
  params: OrgRemovalMemberEmailParams
): Promise<void> {
  const config = getOrgRemovalConfig();
  if (!config) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateMember,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

async function optionalTemplateSend(
  templateId: string | undefined,
  templateParams: Record<string, unknown>
): Promise<void> {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!serviceId || !templateId || !publicKey) return;
  await emailjs.send(
    serviceId,
    templateId,
    { ...templateParams, logo_url: getEmailLogoUrl() },
    { publicKey, privateKey: privateKey ?? undefined }
  );
}

/** Org entered recovery (cold) storage. Requires EMAILJS_TEMPLATE_ID_ORG_RECOVERY_STORAGE. */
export async function sendOrgRecoveryStorageEmail(params: {
  to_email: string;
  org_name: string;
  expires_date: string;
  support_url: string;
}): Promise<void> {
  await optionalTemplateSend(process.env.EMAILJS_TEMPLATE_ID_ORG_RECOVERY_STORAGE, params);
}

/** Org restored from cold storage. Requires EMAILJS_TEMPLATE_ID_ORG_RESTORED. */
export async function sendOrgRestoredEmail(params: {
  to_email: string;
  org_name: string;
}): Promise<void> {
  await optionalTemplateSend(process.env.EMAILJS_TEMPLATE_ID_ORG_RESTORED, params);
}

/** Org cold storage permanently expired. Requires EMAILJS_TEMPLATE_ID_ORG_PURGED. */
export async function sendOrgPurgedEmail(params: {
  to_email: string;
  org_name: string;
}): Promise<void> {
  await optionalTemplateSend(process.env.EMAILJS_TEMPLATE_ID_ORG_PURGED, params);
}

/** Personal team entered recovery storage. Requires EMAILJS_TEMPLATE_ID_TEAM_RECOVERY_STORAGE. */
export async function sendTeamRecoveryStorageEmail(params: {
  to_email: string;
  expires_date: string;
  support_url: string;
}): Promise<void> {
  await optionalTemplateSend(process.env.EMAILJS_TEMPLATE_ID_TEAM_RECOVERY_STORAGE, params);
}

/** Personal team restored. Requires EMAILJS_TEMPLATE_ID_TEAM_RESTORED. */
export async function sendTeamRestoredEmail(params: { to_email: string }): Promise<void> {
  await optionalTemplateSend(process.env.EMAILJS_TEMPLATE_ID_TEAM_RESTORED, params);
}

/** Personal team cold storage permanently expired. Requires EMAILJS_TEMPLATE_ID_TEAM_PURGED. */
export async function sendTeamPurgedEmail(params: { to_email: string }): Promise<void> {
  await optionalTemplateSend(process.env.EMAILJS_TEMPLATE_ID_TEAM_PURGED, params);
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
 * Admin-only email when a share targets a workspace (team/org). No-op if template unset or no to_email.
 */
export async function sendWorkspaceShareAdminNotificationEmail(params: {
  toEmail: string | null | undefined;
  sharedByUserId: string;
  actorDisplayName: string;
  fileIds: string[];
  folderName: string;
  shareToken: string;
  scopeLabel: string;
  workspaceName: string;
  ctaUrl: string;
  shareContextDetail?: string;
}): Promise<void> {
  if (!getShareWorkspaceConfig() || !params.toEmail?.trim()) return;

  let senderPhotoUrl: string;
  try {
    const authUser = await getAdminAuth().getUser(params.sharedByUserId);
    senderPhotoUrl =
      (authUser.photoURL as string) ?? getAvatarPlaceholder(params.actorDisplayName);
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

  try {
    await sendShareWorkspaceEmailToAdmin({
      to_email: params.toEmail.trim().toLowerCase(),
      sender_name: params.actorDisplayName,
      sender_photo_url: senderPhotoUrl,
      file_names_html: fileNamesHtml,
      share_title: shareTitle,
      share_url: shareUrl,
      scope_label: params.scopeLabel,
      workspace_name: params.workspaceName,
      cta_url: params.ctaUrl,
      share_context_detail: params.shareContextDetail ?? "",
    });
  } catch (err) {
    console.error("[EmailJS] Workspace share admin email error:", err);
  }
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

export interface SubscriptionWelcomeEmailParams {
  to_email: string;
  greeting_line: string;
  intro_paragraph: string;
  plan_name: string;
  storage_line: string;
  seats_line: string;
  addons_block: string;
  amount: string;
  cta_url: string;
  cta_text: string;
  footer_paragraph: string;
}

/**
 * Send subscription welcome email when a consumer purchases a subscription.
 * Requires EMAILJS_TEMPLATE_ID_SUBSCRIPTION_WELCOME. If not set, does nothing (no-op).
 * Template params: to_email, greeting_line, intro_paragraph, plan_name, storage_line, seats_line,
 *   addons_block, amount, cta_url, cta_text, footer_paragraph, logo_url
 */
export async function sendSubscriptionWelcomeEmail(
  params: SubscriptionWelcomeEmailParams
): Promise<void> {
  const config = getSubscriptionWelcomeConfig();
  if (!config) {
    console.warn(
      "[EmailJS] Subscription welcome email skipped: EMAILJS_TEMPLATE_ID_SUBSCRIPTION_WELCOME not set"
    );
    return;
  }

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateSubscriptionWelcome,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface SubscriptionChangeReceiptEmailParams {
  to_email: string;
  /** Short plain-text summary, e.g. "Plan: indie · Billing: monthly" */
  change_summary: string;
  /**
   * Line items as plain text (use `{{line_items_plain}}` inside a &lt;pre&gt; in EmailJS — always escaped-safe).
   */
  line_items_plain: string;
  /** Pre-rendered HTML table; use `{{{line_items_html}}}` triple braces in EmailJS for raw HTML */
  line_items_html: string;
  /** Formatted currency, e.g. "$6.94" */
  total_amount: string;
  /** Plain sentence describing charge, credit, or $0 */
  amount_status_line: string;
  /** Note about proration */
  proration_note: string;
  /** Stripe invoice number or id for reference */
  invoice_id: string;
  /** Link to dashboard billing settings */
  manage_billing_url: string;
}

/**
 * Receipt email after an in-app subscription update (plan, add-ons, team seats).
 * Requires EMAILJS_TEMPLATE_ID_SUBSCRIPTION_CHANGE_RECEIPT. No-op if unset or missing recipient.
 * Template params: to_email, change_summary, line_items_plain, line_items_html, total_amount,
 *   amount_status_line, proration_note, invoice_id, manage_billing_url, logo_url
 */
export async function sendSubscriptionChangeReceiptEmail(
  params: SubscriptionChangeReceiptEmailParams
): Promise<void> {
  const config = getSubscriptionChangeReceiptConfig();
  if (!config) {
    console.warn(
      "[EmailJS] Subscription change receipt skipped: EMAILJS_TEMPLATE_ID_SUBSCRIPTION_CHANGE_RECEIPT not set"
    );
    return;
  }
  if (!params.to_email?.trim()) {
    console.warn("[EmailJS] Subscription change receipt skipped: no recipient email");
    return;
  }

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateSubscriptionChangeReceipt,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface GalleryInviteEmailParams {
  to_email: string;
  sender_name: string;
  sender_photo_url: string;
  gallery_title: string;
  gallery_url: string;
  /** Formatted event date (e.g. "October 15, 2024") or empty string */
  event_date_line: string;
}

/**
 * Send a single gallery invite email.
 * Template params: to_email, sender_name, sender_photo_url, gallery_title, gallery_url, event_date_line, logo_url
 */
export async function sendGalleryInviteEmail(
  params: GalleryInviteEmailParams
): Promise<void> {
  const config = getGalleryInviteConfig();
  if (!config) return;

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateGalleryInvite,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

export interface SendGalleryInviteEmailsParams {
  invitedEmails: string[];
  photographerUserId: string;
  photographerDisplayName: string;
  galleryTitle: string;
  galleryId: string;
  /** From profiles/{photographerId}.public_slug — pass null if unset (caller reads Firestore). */
  publicSlug: string | null | undefined;
  /** Gallery document slug — pass null if missing. */
  gallerySlug: string | null | undefined;
  eventDate?: string | null;
}

/**
 * Send gallery invite emails to all invited recipients when a photographer creates an invite-only gallery.
 * Requires EMAILJS_TEMPLATE_ID_GALLERY_INVITE. If not set, does nothing (no-op).
 * Runs asynchronously; errors are logged but do not throw.
 */
export async function sendGalleryInviteEmailsToInvitees(
  params: SendGalleryInviteEmailsParams
): Promise<void> {
  if (!getGalleryInviteConfig() || params.invitedEmails.length === 0) return;

  let senderPhotoUrl: string;
  try {
    const authUser = await getAdminAuth().getUser(params.photographerUserId);
    senderPhotoUrl =
      (authUser.photoURL as string) ??
      getAvatarPlaceholder(params.photographerDisplayName);
  } catch {
    senderPhotoUrl = getAvatarPlaceholder(params.photographerDisplayName);
  }

  const baseUrl = getShareBaseUrl();
  const galleryUrl = getPreferredGalleryShareAbsoluteUrl(baseUrl, {
    publicSlug: params.publicSlug,
    gallerySlug: params.gallerySlug,
    galleryId: params.galleryId,
  });
  const eventDateLine = params.eventDate
    ? new Date(params.eventDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const sendParams: Omit<GalleryInviteEmailParams, "to_email"> = {
    sender_name: params.photographerDisplayName,
    sender_photo_url: senderPhotoUrl,
    gallery_title: params.galleryTitle,
    gallery_url: galleryUrl,
    event_date_line: eventDateLine,
  };

  await Promise.allSettled(
    params.invitedEmails.map((toEmail) =>
      sendGalleryInviteEmail({ ...sendParams, to_email: toEmail })
    )
  ).catch((err) => {
    console.error("[EmailJS] Gallery invite email batch error:", err);
  });
}

export interface SupportTicketEmailParams {
  subject: string;
  message: string;
  user_email: string;
  user_name: string;
  user_id: string;
  issue_type: string;
  created_at: string;
  created_at_formatted?: string;
}

/** User-facing confirmation after submit. Template To = submitting user (to_email). */
export interface SupportTicketConfirmationEmailParams {
  to_email: string;
  ticket_id: string;
  ticket_subject: string;
  ticket_message: string;
  issue_type: string;
  submitted_at: string;
  support_email: string;
}

/**
 * Send support ticket notification email to the configured support inbox.
 * Requires EMAILJS_TEMPLATE_ID_SUPPORT. In EmailJS dashboard, set To to your support email.
 * Template params: subject, message, user_email, user_name, user_id, issue_type, created_at, logo_url
 */
export async function sendSupportTicketEmail(
  params: SupportTicketEmailParams
): Promise<void> {
  const config = getSupportTicketConfig();
  if (!config) {
    console.warn(
      "[EmailJS] Support ticket email skipped: EMAILJS_TEMPLATE_ID_SUPPORT not set"
    );
    return;
  }

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateSupport,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

/**
 * Confirmation email to the user who submitted the ticket.
 * Requires EMAILJS_TEMPLATE_ID_SUPPORT_CONFIRMATION. Subject line e.g. "We received your BizziCloud support request"
 * is usually set in the EmailJS template; pass dynamic fields below for template variables.
 */
export async function sendSupportTicketConfirmationEmail(
  params: SupportTicketConfirmationEmailParams
): Promise<void> {
  const config = getSupportTicketConfirmationConfig();
  if (!config) {
    console.warn(
      "[EmailJS] Support ticket confirmation skipped: EMAILJS_TEMPLATE_ID_SUPPORT_CONFIRMATION not set"
    );
    return;
  }

  const templateParams = {
    ...params,
    logo_url: getEmailLogoUrl(),
  };

  await emailjs.send(
    config.serviceId,
    config.templateConfirmation,
    templateParams,
    {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML table of waitlist fields for EmailJS (use triple braces {{{submission_details_html}}} in body). */
export function buildWaitlistSubmissionDetailsHtml(
  data: {
    fullName: string;
    email: string;
    phone: string;
    creatorType: string;
    socialProfile: string;
    tbNeeded: string;
    currentCloudProvider: string;
    otherProvider?: string;
    currentSpend: string;
    teamSize: string;
    excitedFeatures: readonly string[];
  },
  submittedAt: Date,
): string {
  const e = escapeHtml;
  const other =
    data.currentCloudProvider === "Other" ? e(data.otherProvider ?? "") : "—";
  const social = e(data.socialProfile);
  const spend = e(data.currentSpend);
  const features = e(data.excitedFeatures.join("; "));
  const subAt = e(
    submittedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
  );
  const row = (label: string, value: string) =>
    `<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;font-size:13px;width:38%;vertical-align:top;">${label}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;vertical-align:top;">${value}</td></tr>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">${row("Full name", e(data.fullName))}${row("Email", e(data.email))}${row("Phone", e(data.phone))}${row("Creator type", e(data.creatorType))}${row("Social profile", social)}${row("Storage needed", e(data.tbNeeded))}${row("Current cloud", e(data.currentCloudProvider))}${row("Other provider", other)}${row("Current spend", spend)}${row("Team size", e(data.teamSize))}${row("Excited about", features)}${row("Submitted", subAt)}</table>`;
}

function getWaitlistAdminEmailConfig(): {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID_WAITLIST_ADMIN;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!serviceId || !templateId || !publicKey) return null;
  return {
    serviceId,
    templateId,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

function getWaitlistClientEmailConfig(): {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey?: string;
} | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID_WAITLIST_CLIENT;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!serviceId || !templateId || !publicKey) return null;
  return {
    serviceId,
    templateId,
    publicKey,
    privateKey: privateKey ?? undefined,
  };
}

export type WaitlistAdminEmailParams = {
  admin_email: string;
  full_name: string;
  submitter_email: string;
  submission_details_html: string;
  submitted_at_formatted: string;
};

export type WaitlistClientEmailParams = {
  /** Submitter address — same as `to_email` so either can be used in the EmailJS “To” field. */
  submitter_email: string;
  first_name: string;
  submission_details_html: string;
  submitted_at_formatted: string;
  waitlist_url: string;
};

/**
 * Admin inbox: new waitlist submission. Requires EMAILJS_TEMPLATE_ID_WAITLIST_ADMIN and
 * WAITLIST_ADMIN_NOTIFY_EMAIL. In EmailJS set **To** to {{admin_email}}.
 */
export async function sendWaitlistAdminNotificationEmail(
  params: WaitlistAdminEmailParams,
): Promise<void> {
  const config = getWaitlistAdminEmailConfig();
  if (!config || !params.admin_email) {
    console.warn(
      "[EmailJS] Waitlist admin email skipped: EMAILJS_TEMPLATE_ID_WAITLIST_ADMIN or WAITLIST_ADMIN_NOTIFY_EMAIL missing",
    );
    return;
  }
  await emailjs.send(
    config.serviceId,
    config.templateId,
    { ...params, logo_url: getEmailLogoUrl() },
    { publicKey: config.publicKey, privateKey: config.privateKey },
  );
}

/**
 * Submitter copy with recap + feature highlights. Requires EMAILJS_TEMPLATE_ID_WAITLIST_CLIENT.
 * In EmailJS set **To** to `{{submitter_email}}` or `{{to_email}}` (both are sent).
 */
export async function sendWaitlistClientEmail(params: WaitlistClientEmailParams): Promise<void> {
  const config = getWaitlistClientEmailConfig();
  if (!config) {
    console.warn(
      "[EmailJS] Waitlist client email skipped: EMAILJS_TEMPLATE_ID_WAITLIST_CLIENT not set",
    );
    return;
  }
  const to = params.submitter_email?.trim() ?? "";
  if (!to) {
    console.warn("[EmailJS] Waitlist client email skipped: submitter_email is empty");
    return;
  }
  await emailjs.send(
    config.serviceId,
    config.templateId,
    {
      ...params,
      submitter_email: to,
      to_email: to,
      logo_url: getEmailLogoUrl(),
    },
    { publicKey: config.publicKey, privateKey: config.privateKey },
  );
}

/**
 * EmailJS server-side helpers for enterprise invite flow.
 * Requires env: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_INVOICE, EMAILJS_TEMPLATE_ID_SIGNUP,
 * EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 */

import emailjs from "@emailjs/nodejs";

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

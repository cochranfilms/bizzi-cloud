# Email Templates

Source of truth for EmailJS templates. Copy content into EmailJS dashboard when creating or updating templates.

**Both templates must be created in EmailJS** and their IDs set in env: `EMAILJS_TEMPLATE_ID_INVOICE`, `EMAILJS_TEMPLATE_ID_SIGNUP`.

## Templates

- **invoice.html** — Sent when admin creates org (subscription payment link). Variables: `to_email`, `org_name`, `invoice_url`, `amount`, `storage_line`, `seats_line`, `addons_line` (optional), `logo_url`
- **signup-link.html** — Sent when first subscription payment is received (Stripe webhook `invoice.paid`). Variables: `to_email`, `org_name`, `invite_url`, `logo_url`

## Logo

All templates use the Bizzi Byte logo at `{{logo_url}}` (injected by `src/lib/emailjs.ts`). Logo is served from `/bizzi-byte-logo.png`.

## Stripe Webhook

Ensure your Stripe webhook endpoint includes the `invoice.paid` event. Without it, the sign-up link email will never be sent.

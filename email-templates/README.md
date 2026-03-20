# Email Templates

Source of truth for EmailJS templates. Copy content into EmailJS dashboard when creating or updating templates.

## Templates

- **invoice.html** — Sent when admin creates org (subscription payment link). Variables: `to_email`, `org_name`, `invoice_url`, `amount`, `storage_line`, `seats_line`, `logo_url`
- **signup-link.html** — Sent when first subscription payment is received. Variables: `to_email`, `org_name`, `invite_url`, `logo_url`

## Logo

All templates use the Bizzi Byte logo at `{{logo_url}}` (injected by `src/lib/emailjs.ts`). Logo is served from `/bizzi-byte-logo.png`.

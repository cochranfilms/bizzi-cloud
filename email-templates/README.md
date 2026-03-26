# Email Templates

Source of truth for EmailJS templates. Copy content into EmailJS dashboard when creating or updating templates.

**Enterprise templates** must be created and their IDs set in env: `EMAILJS_TEMPLATE_ID_INVOICE`, `EMAILJS_TEMPLATE_ID_SIGNUP`.

**Share template** (optional): Set `EMAILJS_TEMPLATE_ID_SHARE` to enable email notifications when users share files/folders with others.

**Transfer template** (optional): Set `EMAILJS_TEMPLATE_ID_TRANSFER` to enable email notifications when users create transfers and enter a client email.

**Subscription welcome** (optional): Set `EMAILJS_TEMPLATE_ID_SUBSCRIPTION_WELCOME` to send a welcome email when a consumer purchases a subscription on the platform.

**Gallery invite** (optional): Set `EMAILJS_TEMPLATE_ID_GALLERY_INVITE` to send invite emails when a photographer creates an invite-only gallery with invited emails.

**Personal team invite** (optional): Set `EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE` to email teammates when a personal-account admin invites them (not Organization).

## Templates

- **invoice.html** — Sent when admin creates org (subscription payment link). Variables: `to_email`, `org_name`, `invoice_url`, `amount`, `storage_line`, `seats_line`, `addons_line` (optional), `logo_url`
- **signup-link.html** — Sent when first subscription payment is received (Stripe webhook `invoice.paid`). Variables: `to_email`, `org_name`, `invite_url`, `logo_url`
- **share-files.html** — Sent when a user shares files or folders with another user. Variables: `to_email`, `sender_name`, `sender_photo_url`, `file_names_html`, `share_title`, `share_url`, `logo_url`. In EmailJS, set **To** to `{{to_email}}` and **Subject** to e.g. `{{sender_name}} shared {{share_title}} with you`.
- **transfer-notification.html** — Sent when a user creates a transfer and enters a client email. Variables: `to_email`, `sender_name`, `sender_photo_url`, `file_names_html`, `transfer_title`, `transfer_url`, `logo_url`. In EmailJS, set **To** to `{{to_email}}` and **Subject** to e.g. `{{sender_name}} sent you {{transfer_title}}`.
- **subscription-welcome.html** — Sent when a consumer purchases a subscription (first-time, not plan change). Variables: `to_email`, `greeting_line`, `intro_paragraph`, `plan_name`, `storage_line`, `seats_line`, `addons_block`, `amount`, `cta_url`, `cta_text`, `footer_paragraph`, `logo_url`. In EmailJS, set **To** to `{{to_email}}` and **Subject** to e.g. `Welcome to BizziCloud — Your subscription is ready`.
- **gallery-invite.html** — Sent when a photographer creates an invite-only gallery with invited emails. Variables: `to_email`, `sender_name`, `sender_photo_url`, `gallery_title`, `gallery_url`, `event_date_line`, `logo_url`. In EmailJS, set **To** to `{{to_email}}` and **Subject** to: `{{sender_name}} invited you to view {{gallery_title}}`.
- **support-ticket.html** — Sent when a user submits a support ticket from the dashboard. Variables: `subject`, `message`, `user_email`, `user_name`, `user_id`, `priority`, `issue_type`, `created_at`, `logo_url`. In EmailJS, set **To** to your support inbox (e.g. support@bizzicloud.io) and **Subject** to: `[BizziCloud Support] {{subject}}`.
- **personal-team-invite.html** — Sent when a personal-plan team admin invites someone by email. Variables: `to_email`, `inviter_name`, `seat_access_label`, `what_they_get`, `cta_url`, `cta_label`, `logo_url`. In EmailJS, set **To** to `{{to_email}}` and **Subject** to e.g. `You're invited to join a Bizzi team — {{inviter_name}}`.
- **org-recovery-storage.html** — `EMAILJS_TEMPLATE_ID_ORG_RECOVERY_STORAGE`. Subject: `{{org_name}} is in recovery storage — restore access from your admin dashboard`. Variables: `to_email`, `org_name`, `expires_date`, `support_url`, `logo_url`.
- **org-restored.html** — `EMAILJS_TEMPLATE_ID_ORG_RESTORED`. Subject: `{{org_name}} has been restored on Bizzi Cloud`. Variables: `to_email`, `org_name`, `logo_url`.
- **org-purged.html** — `EMAILJS_TEMPLATE_ID_ORG_PURGED`. Subject: `Cold storage for {{org_name}} has expired — data permanently removed`. Variables: `to_email`, `org_name`, `logo_url`.
- **team-recovery-storage.html** — `EMAILJS_TEMPLATE_ID_TEAM_RECOVERY_STORAGE`. Subject: `Your Bizzi Cloud team is in recovery storage`. Variables: `to_email`, `expires_date`, `support_url`, `logo_url`.
- **team-restored.html** — `EMAILJS_TEMPLATE_ID_TEAM_RESTORED`. Subject: `Your Bizzi Cloud team storage has been restored`. Variables: `to_email`, `logo_url`.
- **team-purged.html** — `EMAILJS_TEMPLATE_ID_TEAM_PURGED`. Subject: `Your team cold storage has expired — data permanently removed`. Variables: `to_email`, `logo_url`.

## Logo

All templates use the Bizzi Byte logo at `{{logo_url}}` (injected by `src/lib/emailjs.ts`). Logo is served from `/bizzi-byte-logo.png`.

## Stripe Webhook

Ensure your Stripe webhook endpoint includes the `invoice.paid` event. Without it, the sign-up link email will never be sent.

# Vendor and Third-Party Services

Bizzi Cloud uses the following third-party services. Each processes data on our behalf. We recommend reviewing their privacy and security documentation.

| Vendor | Purpose | Data Processed | Compliance |
|--------|---------|----------------|------------|
| **Firebase (Google)** | Authentication, Firestore database, Storage, Hosting | User accounts, metadata, profile images | [Firebase Privacy](https://firebase.google.com/support/privacy), [Google Cloud SOC 2](https://cloud.google.com/security/compliance) |
| **Backblaze B2** | File storage | User-uploaded files (encrypted at rest) | [Backblaze Security](https://www.backblaze.com/company/security.html) |
| **Stripe** | Payments, subscriptions | Billing info, payment methods | [Stripe Security](https://stripe.com/docs/security), SOC 2 Type II |
| **Vercel** | Hosting, CDN, serverless functions | Application code, request/response data | [Vercel Security](https://vercel.com/security), SOC 2 Type II |
| **HubSpot** (planned) | Marketing, CRM | Form submissions, analytics (when user consents) | [HubSpot Privacy](https://legal.hubspot.com/privacy-policy) |

## Data Flow

- **User data** is stored in Firestore (metadata) and Backblaze B2 (files)
- **Payment data** is processed by Stripe; we do not store card numbers
- **Analytics** (when HubSpot is added) will be gated behind cookie consent

## Vendor Management

- We select vendors with strong security and privacy practices
- Vendor access to customer data is limited to what is necessary for the service
- We periodically review vendor compliance and terms

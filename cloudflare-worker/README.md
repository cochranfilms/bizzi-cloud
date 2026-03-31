# Bizzi Cloud CDN Worker

Cloudflare Worker that proxies B2 downloads through Cloudflare for **free B2 egress** via the [Bandwidth Alliance](https://www.backblaze.com/b2/docs/cloudflare.html).

## Query parameters

- `exp`, `sig` — required HMAC signed URL (see `src/lib/cdn.ts`).
- `download=<filename>` — attachment download; signature uses `objectKey|exp|filename`.
- `inline=1` — in-browser preview (PDF/audio in iframe); signature uses `objectKey|exp|i`. Omitted for legacy neutral URLs (`objectKey|exp`).

The Worker **must** forward `inline` to `/api/cdn-presigned` and use a **cache key** that includes the disposition mode (`n` / `i` / `d:…`) so inline and attachment responses for the same object are not mixed.

## Flow

1. Client requests `https://cdn.bizzicloud.io/content/abc123?exp=...&sig=...` (optional `&inline=1` or `&download=…`)
2. Worker checks cache
3. On cache miss: Worker calls your API `/api/cdn-presigned` to get a presigned B2 URL
4. Worker fetches from B2 (egress is **free** to Cloudflare)
5. Worker caches and returns to client

## Setup

### 1. Add subdomain in Cloudflare

- DNS: Add CNAME `cdn` → `bizzicloud.io` (or use Workers custom domain)
- Or: Workers & Pages > Add route: `cdn.bizzicloud.io/*`

### 2. Deploy the Worker

```bash
cd cloudflare-worker
npm install
npx wrangler deploy
```

### 3. Configure Worker env

Set `API_BASE_URL` in wrangler.toml `[vars]` or via:

```bash
npx wrangler secret put API_BASE_URL
# Enter: https://bizzicloud.io
```

### 4. Add route in Cloudflare

Workers & Pages > bizzi-cdn > Settings > Triggers > Add route:
- Route: `cdn.bizzicloud.io/*`
- Zone: bizzicloud.io

### 5. Set env vars in Vercel

```
CDN_BASE_URL=https://cdn.bizzicloud.io
CDN_SECRET=<generate a random 32+ char secret, or use B2_SECRET_ACCESS_KEY>
```

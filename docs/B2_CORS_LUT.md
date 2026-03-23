# CORS and LUT

## LUT direct upload (Firebase Storage)

LUT files over 4 MB upload directly from the browser to Firebase Storage (bypassing Vercel's 4.5 MB limit). The Firebase Storage bucket must allow CORS from your app origin. Run:

```bash
npm run firebase:cors
```

Requires gcloud CLI authenticated. See `VERCEL_ENV.md` for details.

## LUT preview (WebGL / media CORS)

Creative LUT preview applies color correction (e.g. Sony Rec 709 for S-Log3) to RAW images and videos. It uses WebGL to sample the media, which **requires CORS headers** on the source.

## Where LUT is used

- **Photo galleries** – image previews with LUT
- **Video galleries** – video previews with LUT
- **Creator RAW** – RAW video preview in the Creator tab

## Why CORS matters

WebGL reads video/image pixels for LUT processing. Same-origin policy blocks texture reads from cross-origin media. If the media URL is served from a different origin (e.g. B2 signed URL, Mux, proxy) without CORS, the LUT preview may show a black screen while the original plays fine.

## Setup

1. Open your **Backblaze B2** bucket in the [Enterprise Web Console](https://www.backblaze.com/docs/manage-b2-cloud-storage-at-scale-enterprise-web-console) (or use the [CLI](https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-cli)).
2. Go to **CORS Rules** and add a rule:
   - **Share with exactly one origin**: Enter your app URL (e.g. `https://www.bizzicloud.io` or `https://your-app.vercel.app`)
   - Or **Share with all HTTPS origins** for broader access.
3. Select **S3-compatible API** (or **Both**) when applying the rule.
4. Save.

## Video delivery

For video LUT preview to work:

- **Direct B2 / signed URLs** – B2 bucket must allow CORS from your app origin
- **Proxy URLs** (e.g. `/api/backup/video-stream-url`, `/api/galleries/.../video-stream-url`) – ensure the proxy response includes CORS headers when serving from B2
- **Mux / HLS** – Mux streams typically include CORS; verify your Mux asset allows your origin if you see black LUT preview

## Fallback

Without CORS, media plays normally but the LUT overlay may not render (black or fallback to original). Users can still download original files and view without LUT.

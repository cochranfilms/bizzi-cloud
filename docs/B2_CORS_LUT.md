# Enable Rec 709 LUT Preview

The LUT preview applies a Rec 709 color correction to S-Log3 / Sony RAW video. It uses WebGL to sample the video, which requires the video to be served with CORS headers.

## Setup

1. Open your **Backblaze B2** bucket in the [Enterprise Web Console](https://www.backblaze.com/docs/manage-b2-cloud-storage-at-scale-enterprise-web-console) (or use the [CLI](https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-cli)).
2. Go to **CORS Rules** and add a rule:
   - **Share with exactly one origin**: Enter your app URL (e.g. `https://app.bizzi.io` or `https://your-app.vercel.app`)
   - Or **Share with all HTTPS origins** for broader access.
3. Select **S3-compatible API** (or **Both**) when applying the rule.
4. Save.

Without CORS, the video will play normally but the LUT preview may show a black screen. With CORS configured, the LUT will apply correctly.

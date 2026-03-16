#!/usr/bin/env node
/**
 * Notarizes the macOS app with Apple for Gatekeeper.
 * Only runs when APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD are set.
 * Without these, the build uses ad-hoc signing (identity: "-"); notarization is skipped.
 */
const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  if (!appleId || !appleIdPassword) {
    console.log(
      "Skipping notarization (APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD not set)"
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword,
    teamId: process.env.APPLE_TEAM_ID,
  });
};

import { CAPABILITY_BUNDLES, METHODS, PROVIDERS } from "./constants.js";

export const PROVIDER_MATRIX = {
  [PROVIDERS.github]: {
    provider: PROVIDERS.github,
    supportedMethods: [METHODS.MANUAL_TOKEN],
    capabilityBundles: [CAPABILITY_BUNDLES.GITHUB_BASIC],
    defaultBundle: CAPABILITY_BUNDLES.GITHUB_BASIC,
  },
  [PROVIDERS.google]: {
    provider: PROVIDERS.google,
    supportedMethods: [METHODS.BROWSER_OAUTH, METHODS.MANUAL_REFRESH_TOKEN],
    capabilityBundles: [
      CAPABILITY_BUNDLES.GMAIL_BASIC,
      CAPABILITY_BUNDLES.DRIVE_BASIC,
    ],
    defaultBundle: CAPABILITY_BUNDLES.GMAIL_BASIC,
  },
};

export function listProviderMatrix() {
  return Object.values(PROVIDER_MATRIX);
}

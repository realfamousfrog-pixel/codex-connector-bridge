import { CAPABILITY_BUNDLES, CONNECTOR_HINTS, METHODS, STATES } from "../constants.js";
import { jsonRequest } from "../http-client.js";
import { nowIso } from "../utils.js";

export const githubProvider = {
  provider: "github",
  supportedMethods: [METHODS.MANUAL_TOKEN],
  capabilityBundles: [CAPABILITY_BUNDLES.GITHUB_BASIC],

  async validateSecret(secret) {
    if (!secret?.token) {
      return {
        state: STATES.INVALID,
        message: "GitHub token is required.",
      };
    }
    const result = await jsonRequest("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${secret.token}`,
        "User-Agent": "codex-service-auth-gateway",
      },
    });
    if (result.status === 401) {
      return {
        state: STATES.INVALID,
        message: "GitHub token is invalid or expired.",
      };
    }
    if (!result.ok) {
      return {
        state: STATES.INVALID,
        message: `GitHub validation failed with status ${result.status}.`,
      };
    }
    const scopesHeader = result.headers["x-oauth-scopes"] ?? "";
    const scopes = scopesHeader
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const hasUsefulScope =
      scopes.length === 0 ||
      scopes.includes("repo") ||
      scopes.includes("read:user") ||
      scopes.includes("user");
    if (!hasUsefulScope) {
      return {
        state: STATES.INVALID,
        message: "GitHub token does not grant the required baseline scopes.",
      };
    }
    return {
      state: STATES.AUTHENTICATED,
      accountLabel: result.body?.login ?? "github-user",
      grantedBundles: [CAPABILITY_BUNDLES.GITHUB_BASIC],
      capabilities: scopes,
      expiresAt: null,
      connectorHint: CONNECTOR_HINTS.LOCAL,
      lastValidatedAt: nowIso(),
      message: "GitHub token validated.",
    };
  },
};

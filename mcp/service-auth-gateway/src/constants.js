export const PROVIDERS = {
  github: "github",
  google: "google",
};

export const STATES = {
  NOT_CONFIGURED: "not_configured",
  UNAUTHENTICATED: "unauthenticated",
  AUTHENTICATED: "authenticated",
  EXPIRED: "expired",
  INVALID: "invalid",
  SAVED: "saved",
};

export const METHODS = {
  BROWSER_OAUTH: "browser_oauth",
  MANUAL_TOKEN: "manual_token",
  MANUAL_REFRESH_TOKEN: "manual_refresh_token",
};

export const CAPABILITY_BUNDLES = {
  GITHUB_BASIC: "github-basic",
  GMAIL_BASIC: "gmail-basic",
  DRIVE_BASIC: "drive-basic",
};

export const SECRET_PREFIX = "codex-auth-gateway";

export const CONNECTOR_HINTS = {
  OFFICIAL: "use_official_connector",
  LOCAL: "use_local_auth_gateway",
  BLOCKED: "auth_blocked_with_reason",
};

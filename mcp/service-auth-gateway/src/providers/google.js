import crypto from "node:crypto";
import { CAPABILITY_BUNDLES, CONNECTOR_HINTS, METHODS, STATES } from "../constants.js";
import { jsonRequest } from "../http-client.js";
import { addSeconds, nowIso } from "../utils.js";

const GOOGLE_SCOPES = {
  [CAPABILITY_BUNDLES.GMAIL_BASIC]: [
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
  [CAPABILITY_BUNDLES.DRIVE_BASIC]: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/presentations.readonly",
  ],
};

function dedupeScopes(bundles) {
  return [...new Set(bundles.flatMap((bundle) => GOOGLE_SCOPES[bundle] ?? []))];
}

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(64));
}

function createCodeChallenge(codeVerifier) {
  return base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());
}

function buildAuthUrl(clientId, redirectUri, state, bundles, codeChallenge) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    scope: dedupeScopes(bundles).join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeRefreshToken(secret) {
  const params = new URLSearchParams({
    client_id: secret.clientId,
    client_secret: secret.clientSecret,
    refresh_token: secret.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await jsonRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = response.body;
  if (!response.ok) {
    return {
      ok: false,
      message: body.error_description ?? body.error ?? "Google token refresh failed.",
    };
  }
  return {
    ok: true,
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? 3600,
  };
}

async function fetchProfile(accessToken) {
  const result = await jsonRequest("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!result.ok) {
    return null;
  }
  return result.body;
}

async function fetchGmailProfile(accessToken) {
  const result = await jsonRequest("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!result.ok) {
    return null;
  }
  return result.body;
}

async function resolveAccountLabel(accessToken, bundles = []) {
  const bundleSet = new Set(bundles);
  let gmailEmail = null;
  if (bundleSet.has(CAPABILITY_BUNDLES.GMAIL_BASIC)) {
    const gmailProfile = await fetchGmailProfile(accessToken);
    gmailEmail = gmailProfile?.emailAddress ?? null;
  }
  const profile = await fetchProfile(accessToken);
  return {
    profile,
    accountLabel: gmailEmail ?? profile?.email ?? null,
  };
}

export const googleProvider = {
  provider: "google",
  supportedMethods: [METHODS.BROWSER_OAUTH, METHODS.MANUAL_REFRESH_TOKEN],
  capabilityBundles: [CAPABILITY_BUNDLES.GMAIL_BASIC, CAPABILITY_BUNDLES.DRIVE_BASIC],

  buildPendingOAuth({ clientId, redirectUri, bundles }) {
    const state = crypto.randomUUID();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    return {
      oauthState: state,
      codeVerifier,
      redirectUri,
      authorizationUrl: buildAuthUrl(clientId, redirectUri, state, bundles, codeChallenge),
      bundles,
    };
  },

  async completeOAuth({ clientId, clientSecret, redirectUri, code, bundles, codeVerifier }) {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    });
    const response = await jsonRequest("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const body = response.body;
    if (!response.ok) {
      return {
        state: STATES.INVALID,
        message: body.error_description ?? body.error ?? "Google OAuth exchange failed.",
      };
    }
    const resolvedAccount = await resolveAccountLabel(body.access_token, bundles);
    return {
      state: STATES.AUTHENTICATED,
      secret: {
        clientId,
        clientSecret,
        refreshToken: body.refresh_token,
        accessToken: body.access_token,
      },
      accountLabel: resolvedAccount.accountLabel,
      grantedBundles: bundles,
      capabilities: dedupeScopes(bundles),
      expiresAt: addSeconds(nowIso(), body.expires_in ?? 3600),
      connectorHint: CONNECTOR_HINTS.LOCAL,
      lastValidatedAt: nowIso(),
      message: "Google OAuth completed.",
    };
  },

  async validateSecret(secret, expectedBundles = []) {
    if (!secret?.clientId || !secret?.clientSecret || !secret?.refreshToken) {
      return {
        state: STATES.NOT_CONFIGURED,
        message: "Google OAuth client and refresh token are required.",
      };
    }
    const refreshed = await exchangeRefreshToken(secret);
    if (!refreshed.ok) {
      return {
        state: STATES.EXPIRED,
        message: refreshed.message,
      };
    }
    const grantedBundles = secret.grantedBundles ?? expectedBundles;
    const resolvedAccount = await resolveAccountLabel(refreshed.accessToken, grantedBundles);
    return {
      state: STATES.AUTHENTICATED,
      accountLabel: resolvedAccount.accountLabel,
      grantedBundles,
      capabilities: dedupeScopes(grantedBundles),
      expiresAt: addSeconds(nowIso(), refreshed.expiresIn),
      connectorHint: CONNECTOR_HINTS.LOCAL,
      lastValidatedAt: nowIso(),
      accessToken: refreshed.accessToken,
      message: "Google token validated.",
    };
  },
};

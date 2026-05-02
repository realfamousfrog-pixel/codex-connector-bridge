import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(os.tmpdir(), "codex-auth-gateway-test-data");
const stateFile = path.join(testDataDir, "state.json");
const sessionsFile = path.join(testDataDir, "sessions.json");
let cachedModules;

async function loadModules() {
  if (!cachedModules) {
    cachedModules = Promise.all([
      import("../src/gateway.js"),
      import("../src/loopback-manager.js"),
      import("../src/panel-server.js"),
    ]).then(([gatewayMod, loopbackMod, panelServerMod]) => ({
      AuthGateway: gatewayMod.AuthGateway,
      closeAllLoopbackServers: loopbackMod.closeAllLoopbackServers,
      closePanelServerAsync: panelServerMod.closePanelServerAsync,
    }));
  }
  return cachedModules;
}

async function createGateway() {
  const { AuthGateway } = await loadModules();
  const gateway = new AuthGateway();
  await gateway.init();
  return gateway;
}

async function closeLoopbackServersForTest() {
  const { closeAllLoopbackServers, closePanelServerAsync } = await loadModules();
  closeAllLoopbackServers();
  await closePanelServerAsync();
}

async function resetData() {
  await fs.mkdir(testDataDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify({ providers: {} }, null, 2), "utf8");
  await fs.writeFile(sessionsFile, JSON.stringify({ sessions: {} }, null, 2), "utf8");
}

async function createProjectDir(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

test.beforeEach(async () => {
  process.env.CODEX_AUTH_GATEWAY_TEST_MODE = "1";
  process.env.CODEX_AUTH_GATEWAY_DATA_DIR = testDataDir;
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = "";
  process.env.CODEX_AUTH_GATEWAY_SECRET_GOOGLE = "";
  await resetData();
  cachedModules = null;
});

test.afterEach(() => {
  return closeLoopbackServersForTest();
});

test("auth_list_providers returns github and google in unauthenticated state", async () => {
  const gateway = await createGateway();
  const result = await gateway.auth_list_providers();
  assert.equal(result.providers.length, 2);
  assert.deepEqual(
    result.providers.map((item) => item.provider).sort(),
    ["github", "google"],
  );
  assert.ok(result.providers.every((item) => item.state === "unauthenticated"));
});

test("auth_status returns saved when only secret exists and metadata can be restored later", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const result = await gateway.auth_status({ provider: "github" });
  assert.equal(result.state, "saved");
  assert.equal(result.nextAction, "validate_saved_secret");
});

test("auth_validate restores github when only secret exists", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user", name: "Demo User" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_validate({ provider: "github" });
    assert.equal(result.state, "authenticated");
    assert.equal(result.accountLabel, "Demo User");
    assert.equal(result.nextAction, "ready");
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_begin for github manual token returns required field", async () => {
  const gateway = await createGateway();
  const result = await gateway.auth_begin({
    provider: "github",
    method: "manual_token",
    capabilityBundle: "github-basic",
  });
  assert.equal(result.provider, "github");
  assert.equal(result.nextAction, "submit_manual_token");
  assert.deepEqual(result.requiredFields, ["token"]);
});

test("auth_status returns reauth_required when bundle is missing", async () => {
  const gateway = await createGateway();
  await fs.writeFile(
    stateFile,
    JSON.stringify(
      {
        providers: {
          google: {
            provider: "google",
            state: "authenticated",
            accountLabel: "demo@example.com",
            grantedBundles: ["gmail-basic"],
            lastValidatedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-01-01T01:00:00.000Z",
            authMethod: "manual_refresh_token",
            connectorPreference: "use_local_auth_gateway",
            capabilities: [],
            connectorHint: "use_local_auth_gateway",
            nextAction: "ready",
            message: "ok",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  const result = await gateway.auth_status({
    provider: "google",
    capabilityBundle: "drive-basic",
  });
  assert.equal(result.nextAction, "reauth_required");
});

test("sanitize logging path does not persist secrets to state file", async () => {
  const gateway = await createGateway();
  const begin = await gateway.auth_begin({
    provider: "google",
    method: "manual_refresh_token",
    capabilityBundle: "gmail-basic",
  });
  assert.ok(begin.sessionId);
  const raw = await fs.readFile(stateFile, "utf8");
  assert.equal(raw.includes("refreshToken"), false);
});

test("auth_logout removes provider state metadata", async () => {
  const gateway = await createGateway();
  await fs.writeFile(
    stateFile,
    JSON.stringify(
      {
        providers: {
          github: {
            provider: "github",
            state: "authenticated",
            accountLabel: "demo-user",
            grantedBundles: ["github-basic"],
            lastValidatedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: null,
            authMethod: "manual_token",
            connectorPreference: "use_local_auth_gateway",
            capabilities: ["repo"],
            connectorHint: "use_local_auth_gateway",
            nextAction: "ready",
            message: "ok",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  const result = await gateway.auth_logout({ provider: "github" });
  assert.equal(result.state, "unauthenticated");
  const raw = JSON.parse(await fs.readFile(stateFile, "utf8"));
  assert.equal(raw.providers.github, undefined);
});

test("google browser oauth flow starts loopback listener and waits for callback", async () => {
  const gateway = await createGateway();
  const begin = await gateway.auth_begin({
    provider: "google",
    method: "browser_oauth",
    capabilityBundle: "gmail-basic",
  });
  const prepare = await gateway.auth_complete({
    sessionId: begin.sessionId,
    payload: {
      clientId: "client-id",
      clientSecret: "client-secret",
    },
  });
  assert.equal(prepare.nextAction, "open_browser_and_wait_for_callback");
  assert.ok(prepare.authorizationUrl.includes("accounts.google.com"));
  assert.match(prepare.redirectUri, /^http:\/\/localhost:\d+\/$/);
  assert.ok(prepare.authorizationUrl.includes("code_challenge="));
  assert.ok(prepare.authorizationUrl.includes("code_challenge_method=S256"));

  const waiting = await gateway.auth_complete({
    sessionId: begin.sessionId,
  });
  assert.equal(waiting.nextAction, "await_browser_callback");
});

test("google browser oauth callback can complete with mocked token exchange", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith("http://127.0.0.1:") || String(url).startsWith("http://localhost:")) {
      return originalFetch(url, options);
    }
    if (String(url).includes("oauth2.googleapis.com/token")) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("code_verifier")?.length > 40, true);
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return {
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
          };
        },
        async text() {
          return JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
          });
        },
      };
    }
    if (String(url).includes("googleapis.com/oauth2/v2/userinfo")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ email: "demo@example.com" });
        },
      };
    }
    if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ emailAddress: "demo@example.com" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const gateway = await createGateway();
    const begin = await gateway.auth_begin({
      provider: "google",
      method: "browser_oauth",
      capabilityBundle: "gmail-basic",
    });
    const prepare = await gateway.auth_complete({
      sessionId: begin.sessionId,
      payload: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });
    assert.match(prepare.redirectUri, /^http:\/\/localhost:\d+\/$/);
    const callbackUrl = new URL(prepare.redirectUri);
    callbackUrl.searchParams.set("code", "demo-code");
    callbackUrl.searchParams.set("state", prepare.expectedState);
    await fetch(callbackUrl);

    const completed = await gateway.auth_complete({
      sessionId: begin.sessionId,
    });
    assert.equal(completed.state, "authenticated");
    assert.equal(completed.accountLabel, "demo@example.com");
    assert.equal(completed.nextAction, "ready");
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_status_overview returns a visualization-friendly summary", async () => {
  const gateway = await createGateway();
  const result = await gateway.auth_status_overview();
  assert.equal(Array.isArray(result.summary), true);
  assert.equal(result.summary.length, 2);
  assert.ok(result.summary.every((item) => "provider" in item));
  assert.ok(result.summary.every((item) => "state" in item));
});

test("github account label prefers display name", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user", name: "Demo User" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_validate({ provider: "github" });
    assert.equal(result.accountLabel, "Demo User");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github account label falls back to @login when name is missing", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_validate({ provider: "github" });
    assert.equal(result.accountLabel, "@demo-user");
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_status_cards returns github and gmail cached cards", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const result = await gateway.auth_status_cards();
  assert.equal(Array.isArray(result.cards), true);
  assert.deepEqual(
    result.cards.map((item) => item.id).sort(),
    ["github", "gmail"],
  );
  const githubCard = result.cards.find((item) => item.id === "github");
  assert.equal(githubCard.state, "saved");
  assert.equal(githubCard.statusSource, "cached");
  assert.equal(githubCard.isOnlineVerified, false);
  assert.equal(githubCard.stateLabel, "已保存，待校验");
  assert.equal(githubCard.statusSourceLabel, "本地摘要");
  assert.equal(githubCard.accountLabelTitle, "GitHub 账号");
});

test("auth_refresh_status_card validates github online", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user", name: "Demo User" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_refresh_status_card({ cardId: "github" });
    assert.equal(result.state, "authenticated");
    assert.equal(result.statusSource, "online");
    assert.equal(result.isOnlineVerified, true);
    assert.equal(result.accountLabel, "Demo User");
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_refresh_status_card returns invalid github card when token is invalid", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: false,
        status: 401,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ message: "Bad credentials" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_refresh_status_card({ cardId: "github" });
    assert.equal(result.state, "invalid");
    assert.equal(result.statusSource, "online");
    assert.equal(result.isOnlineVerified, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_refresh_status_card validates gmail from google provider", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GOOGLE = JSON.stringify({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    grantedBundles: ["gmail-basic"],
  });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { access_token: "access-token", expires_in: 3600 };
        },
        async text() {
          return JSON.stringify({ access_token: "access-token", expires_in: 3600 });
        },
      };
    }
    if (String(url).includes("googleapis.com/oauth2/v2/userinfo")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ email: "fallback@example.com" });
        },
      };
    }
    if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ emailAddress: "demo@example.com" });
        },
      };
    }
    if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ emailAddress: "demo@example.com" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_refresh_status_card({ cardId: "gmail" });
    assert.equal(result.state, "authenticated");
    assert.equal(result.statusSource, "online");
    assert.equal(result.accountLabel, "demo@example.com");
    assert.equal(result.stateLabel, "已登录");
    assert.equal(result.statusSourceLabel, "已在线校验");
    assert.equal(result.message, "Gmail 登录状态校验通过");
  } finally {
    global.fetch = originalFetch;
  }
});

test("gmail account falls back to google email when gmail profile is unavailable", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GOOGLE = JSON.stringify({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    grantedBundles: ["gmail-basic"],
  });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { access_token: "access-token", expires_in: 3600 };
        },
        async text() {
          return JSON.stringify({ access_token: "access-token", expires_in: 3600 });
        },
      };
    }
    if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
      return {
        ok: false,
        status: 403,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ error: { message: "forbidden" } });
        },
      };
    }
    if (String(url).includes("googleapis.com/oauth2/v2/userinfo")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ email: "fallback@example.com" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_refresh_status_card({ cardId: "gmail" });
    assert.equal(result.accountLabel, "fallback@example.com");
  } finally {
    global.fetch = originalFetch;
  }
});

test("gmail account stays hidden when no profile email is available", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GOOGLE = JSON.stringify({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    grantedBundles: ["gmail-basic"],
  });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { access_token: "access-token", expires_in: 3600 };
        },
        async text() {
          return JSON.stringify({ access_token: "access-token", expires_in: 3600 });
        },
      };
    }
    if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
      return {
        ok: false,
        status: 403,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ error: { message: "forbidden" } });
        },
      };
    }
    if (String(url).includes("googleapis.com/oauth2/v2/userinfo")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ name: "no-email-user" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_refresh_status_card({ cardId: "gmail" });
    assert.equal(result.accountLabel, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_status_cards shows gmail reauth_required when gmail bundle is missing", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GOOGLE = JSON.stringify({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    grantedBundles: ["drive-basic"],
  });
  await fs.writeFile(
    stateFile,
    JSON.stringify(
      {
        providers: {
          google: {
            provider: "google",
            state: "authenticated",
            accountLabel: "demo@example.com",
            grantedBundles: ["drive-basic"],
            lastValidatedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-01-01T01:00:00.000Z",
            authMethod: "manual_refresh_token",
            connectorPreference: "use_local_auth_gateway",
            capabilities: [],
            connectorHint: "use_local_auth_gateway",
            nextAction: "ready",
            message: "ok",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  const gateway = await createGateway();
  const result = await gateway.auth_status_cards();
  const gmailCard = result.cards.find((item) => item.id === "gmail");
  assert.equal(gmailCard.state, "reauth_required");
});

test("auth_refresh_status_card returns expired gmail when refresh token is invalid", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GOOGLE = JSON.stringify({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    grantedBundles: ["gmail-basic"],
  });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: false,
        status: 400,
        headers: new Headers(),
        async json() {
          return { error: "invalid_grant" };
        },
        async text() {
          return JSON.stringify({ error: "invalid_grant" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_refresh_status_card({ cardId: "gmail" });
    assert.equal(result.state, "expired");
    assert.equal(result.statusSource, "online");
    assert.equal(result.isOnlineVerified, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_publish_prepare blocks when target owner differs from authenticated user", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const projectDir = await createProjectDir("codex-auth-publish-owner");
  await fs.writeFile(path.join(projectDir, "README.md"), "demo", "utf8");
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith("/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user" });
        },
      };
    }
    if (String(url).includes("/repos/")) {
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ message: "Not Found" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_publish_prepare({
      projectPath: projectDir,
      repositoryUrl: "https://github.com/another-user/demo-repo",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "owner_not_supported");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_publish_prepare returns preview and required inputs for missing repo", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const projectDir = await createProjectDir("codex-auth-publish-preview");
  await fs.writeFile(path.join(projectDir, "index.js"), "console.log('demo')\n", "utf8");
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith("/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user" });
        },
      };
    }
    if (String(url).includes("/repos/demo-user/demo-repo")) {
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ message: "Not Found" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_publish_prepare({
      projectPath: projectDir,
      repositoryUrl: "https://github.com/demo-user/demo-repo",
    });
    assert.equal(result.ok, true);
    assert.equal(result.requiredInputs.visibility, true);
    assert.equal(result.preview.count > 0, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_publish_execute rejects execution without preview confirmation", async () => {
  const gateway = await createGateway();
  await assert.rejects(
    gateway.github_publish_execute({
      projectPath: "D:/demo",
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      commitMessage: "init",
      confirmStagePreview: false,
    }),
    /confirmStagePreview must be true/i,
  );
});

test("ui_open_panel returns local URL and panel API requires token", async () => {
  const gateway = await createGateway();
  const panel = await gateway.ui_open_panel();
  assert.equal(panel.ok, true);
  assert.match(panel.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
  const unauthorized = await fetch(panel.url.replace("/?token=", "/api/status-overview?token=bad"));
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(panel.url.replace("/?token=", "/api/status-overview?token="));
  assert.equal(authorized.status, 200);
});

test("panel HTML hides token note and technical status copy", async () => {
  const gateway = await createGateway();
  const panel = await gateway.ui_open_panel();
  const htmlResponse = await fetch(panel.url);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.equal(html.includes("panel token"), false);
  assert.equal(html.includes("首次 commit message"), false);
  assert.equal(html.includes("首屏先显示本地摘要"), false);
  assert.equal(html.includes("authenticated"), false);
});

test("panel status card APIs return github and gmail cards and require token", async () => {
  const gateway = await createGateway();
  const panel = await gateway.ui_open_panel();
  const unauthorized = await fetch(panel.url.replace("/?token=", "/api/status-cards?token=bad"), {
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);

  const token = new URL(panel.url).searchParams.get("token");
  const cardsResponse = await fetch(panel.url.replace("/?token=", "/api/status-cards?token="), {
    method: "POST",
  });
  assert.equal(cardsResponse.status, 200);
  const cardsPayload = await cardsResponse.json();
  assert.deepEqual(
    cardsPayload.cards.map((item) => item.id).sort(),
    ["github", "gmail"],
  );

  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith("http://127.0.0.1:") || String(url).startsWith("http://localhost:")) {
      return originalFetch(url, options);
    }
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user", name: "Demo User" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  try {
    const refreshResponse = await fetch(
      `http://127.0.0.1:${new URL(panel.url).port}/api/status-cards/refresh?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "github" }),
      },
    );
    assert.equal(refreshResponse.status, 200);
    const refreshPayload = await refreshResponse.json();
    assert.equal(refreshPayload.card.id, "github");
  } finally {
    global.fetch = originalFetch;
  }
});

test("panel HTML keeps publish result visible after execute", async () => {
  const gateway = await createGateway();
  const panel = await gateway.ui_open_panel();
  const htmlResponse = await fetch(panel.url);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.match(
    html,
    /const data = await api\("\/api\/github\/publish\/execute"[\s\S]+?renderResult\(data\);[\s\S]+?updatePreviewFromResult\(data\);[\s\S]+?await loadStatusCards\(\);/,
  );
});

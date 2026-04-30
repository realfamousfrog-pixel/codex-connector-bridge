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
          return JSON.stringify({ login: "demo-user" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_validate({ provider: "github" });
    assert.equal(result.state, "authenticated");
    assert.equal(result.accountLabel, "demo-user");
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

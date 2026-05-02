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

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function loadModules() {
  if (!cachedModules) {
    cachedModules = Promise.all([
      import("../src/gateway.js"),
      import("../src/loopback-manager.js"),
      import("../src/panel-server.js"),
      import("../src/state-store.js"),
    ]).then(([gatewayMod, loopbackMod, panelServerMod, stateStoreMod]) => ({
      AuthGateway: gatewayMod.AuthGateway,
      closeAllLoopbackServers: loopbackMod.closeAllLoopbackServers,
      closePanelServerAsync: panelServerMod.closePanelServerAsync,
      stateStore: stateStoreMod,
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
  await writeJsonAtomic(stateFile, { providers: {} });
  await writeJsonAtomic(sessionsFile, { sessions: {} });
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

test("readState recovers from an empty state file by recreating the fallback JSON", async () => {
  await resetData();
  cachedModules = null;
  const { stateStore } = await loadModules();
  await fs.writeFile(stateFile, "", "utf8");

  const state = await stateStore.readState();
  assert.deepEqual(state, { providers: {} });
  assert.deepEqual(JSON.parse(await fs.readFile(stateFile, "utf8")), { providers: {} });
});

test("setSession serializes concurrent writes so session JSON stays valid", async () => {
  await resetData();
  cachedModules = null;
  const { stateStore } = await loadModules();

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      stateStore.setSession(`session-${index}`, {
        provider: "google",
        method: "browser_oauth",
        index,
      }),
    ),
  );

  const sessions = await stateStore.readSessions();
  assert.equal(Object.keys(sessions.sessions).length, 20);
  const rawSessions = await fs.readFile(sessionsFile, "utf8");
  assert.doesNotThrow(() => JSON.parse(rawSessions));
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

test("auth_resolve_route sends github read operations to local fallback when official connector cannot be stably verified", async () => {
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
    const result = await gateway.auth_resolve_route({
      provider: "github",
      intent: "business_operation",
      capabilityBundle: "github-basic",
      operationName: "pull_request_list",
      repositoryUrl: "https://github.com/demo-user/demo-repo",
    });
    assert.equal(result.selectedRoute, "use_local_auth_gateway");
    assert.equal(result.executionChannel, "local_fallback");
    assert.deepEqual(result.recommendedLocalTools, ["github_pull_request_list"]);
    assert.equal(result.officialCapability.status, "unknown");
    assert.equal(result.localState.state, "authenticated");
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_resolve_route blocks google business operations when local auth is missing", async () => {
  const gateway = await createGateway();
  const result = await gateway.auth_resolve_route({
    provider: "google",
    intent: "business_operation",
    capabilityBundle: "drive-basic",
    operationName: "open_drive_file",
  });
  assert.equal(result.selectedRoute, "auth_blocked_with_reason");
  assert.equal(result.reason, "google_auth_required");
  assert.equal(result.recommendedLocalTools.includes("auth_begin"), true);
});

test("auth_resolve_route keeps github publish on the local gateway path", async () => {
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
    const result = await gateway.auth_resolve_route({
      provider: "github",
      intent: "publish",
    });
    assert.equal(result.selectedRoute, "use_local_auth_gateway");
    assert.deepEqual(result.recommendedLocalTools, [
      "github_publish_prepare",
      "github_publish_execute",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_repository_get returns blocked when local github auth is missing", async () => {
  const gateway = await createGateway();
  const result = await gateway.github_repository_get({
    repositoryUrl: "https://github.com/demo-user/demo-repo",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "github_auth_required");
});

test("github_repository_get returns repository summary", async () => {
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
    if (String(url).includes("/repos/demo-user/demo-repo")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            name: "demo-repo",
            full_name: "demo-user/demo-repo",
            description: "demo",
            visibility: "private",
            private: true,
            owner: { login: "demo-user", type: "User" },
            default_branch: "main",
            html_url: "https://github.com/demo-user/demo-repo",
            url: "https://api.github.com/repos/demo-user/demo-repo",
            size: 10,
            stargazers_count: 2,
            watchers_count: 2,
            forks_count: 1,
            open_issues_count: 3,
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_repository_get({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
    });
    assert.equal(result.ok, true);
    assert.equal(result.repository.summary.defaultBranch, "main");
    assert.equal(result.repository.summary.owner.login, "demo-user");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_branch_list returns branch summaries", async () => {
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
    if (String(url).includes("/repos/demo-user/demo-repo/branches")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify([
            {
              name: "main",
              protected: true,
              commit: { sha: "abc123" },
            },
          ]);
        },
      };
    }
    if (String(url).includes("/repos/demo-user/demo-repo")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            name: "demo-repo",
            full_name: "demo-user/demo-repo",
            owner: { login: "demo-user", type: "User" },
            default_branch: "main",
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_branch_list({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      limit: 10,
    });
    assert.equal(result.ok, true);
    assert.equal(result.branches.length, 1);
    assert.equal(result.branches[0].isDefault, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_list returns pull request summaries", async () => {
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
    if (String(url).includes("/repos/demo-user/demo-repo/pulls?state=open")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify([
            {
              number: 12,
              state: "open",
              title: "Fix login flow",
              user: { login: "demo-user" },
              html_url: "https://github.com/demo-user/demo-repo/pull/12",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
              head: { ref: "feature/login" },
              base: { ref: "main" },
              draft: false,
            },
          ]);
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_pull_request_list({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      state: "open",
    });
    assert.equal(result.ok, true);
    assert.equal(result.pullRequests[0].number, 12);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_get returns blocked when pull request is missing", async () => {
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
    if (String(url).includes("/repos/demo-user/demo-repo/pulls/99")) {
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
    const result = await gateway.github_pull_request_get({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      pullNumber: 99,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "pull_request_not_found");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_list filters out pull request items", async () => {
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
    if (String(url).includes("/repos/demo-user/demo-repo/issues?state=open")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify([
            {
              number: 7,
              state: "open",
              title: "Issue title",
              user: { login: "demo-user" },
              html_url: "https://github.com/demo-user/demo-repo/issues/7",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
              labels: [{ name: "bug" }],
            },
            {
              number: 8,
              state: "open",
              title: "PR mirror",
              pull_request: { url: "https://api.github.com/repos/demo-user/demo-repo/pulls/8" },
              user: { login: "demo-user" },
              html_url: "https://github.com/demo-user/demo-repo/pull/8",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
              labels: [],
            },
          ]);
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_issue_list({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      state: "open",
    });
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].number, 7);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_get returns issue detail", async () => {
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
    if (String(url).includes("/repos/demo-user/demo-repo/issues/7")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            number: 7,
            state: "open",
            title: "Issue title",
            body: "Issue body",
            user: { login: "demo-user" },
            html_url: "https://github.com/demo-user/demo-repo/issues/7",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
            labels: [{ name: "bug" }],
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_issue_get({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      issueNumber: 7,
    });
    assert.equal(result.ok, true);
    assert.equal(result.issue.body, "Issue body");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_repository_get rejects invalid repository url", async () => {
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
    await assert.rejects(
      gateway.github_repository_get({ repositoryUrl: "not-a-url" }),
      /repositoryUrl must be a valid GitHub HTTPS URL/i,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_list rejects invalid state", async () => {
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
    await assert.rejects(
      gateway.github_pull_request_list({
        repositoryUrl: "https://github.com/demo-user/demo-repo",
        state: "merged",
      }),
      /state must be open, closed, or all/i,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_resolve_route sends github write operations to local fallback when official connector cannot be stably verified", async () => {
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
    const result = await gateway.auth_resolve_route({
      provider: "github",
      intent: "business_operation",
      capabilityBundle: "github-basic",
      operationName: "issue_create",
      repositoryUrl: "https://github.com/demo-user/demo-repo",
    });
    assert.equal(result.selectedRoute, "use_local_auth_gateway");
    assert.equal(result.executionChannel, "local_fallback");
    assert.deepEqual(result.recommendedLocalTools, ["github_issue_create"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_resolve_route blocks github write operations when local token lacks write scopes", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "read:user,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.auth_resolve_route({
      provider: "github",
      intent: "business_operation",
      capabilityBundle: "github-basic",
      operationName: "pull_request_create",
      repositoryUrl: "https://github.com/demo-user/demo-repo",
    });
    assert.equal(result.selectedRoute, "auth_blocked_with_reason");
    assert.equal(result.reason, "github_scope_missing");
    assert.deepEqual(result.missingScopes, ["repo or public_repo"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth_resolve_route rejects drifted github operation names", async () => {
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
    await assert.rejects(
      gateway.auth_resolve_route({
        provider: "github",
        intent: "business_operation",
        capabilityBundle: "github-basic",
        operationName: "list_pull_requests",
        repositoryUrl: "https://github.com/demo-user/demo-repo",
      }),
      /Unsupported GitHub operation: list_pull_requests/i,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_create returns blocked when local github auth is missing", async () => {
  const gateway = await createGateway();
  const result = await gateway.github_issue_create({
    repositoryUrl: "https://github.com/demo-user/demo-repo",
    title: "Issue title",
    confirm: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "github_auth_required");
});

test("github_issue_create requires confirm", async () => {
  const gateway = await createGateway();
  await assert.rejects(
    gateway.github_issue_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "Issue title",
      confirm: false,
    }),
    /github_issue_create requires confirm=true/i,
  );
});

test("github_issue_create returns blocked when local token lacks write scopes", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("api.github.com/user")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "read:user,user" }),
        async text() {
          return JSON.stringify({ login: "demo-user" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_issue_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "Issue title",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "github_scope_missing");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_create returns created issue summary", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/issues")) {
      assert.equal(options.method, "POST");
      return {
        ok: true,
        status: 201,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            number: 17,
            state: "open",
            title: "Issue title",
            body: "Issue body",
            user: { login: "demo-user" },
            html_url: "https://github.com/demo-user/demo-repo/issues/17",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            labels: [],
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_issue_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "Issue title",
      body: "Issue body",
      confirm: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.issue.number, 17);
    assert.equal(result.operationName, "issue_create");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_create maps 404 to repository_not_found", async () => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/issues")) {
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
    const result = await gateway.github_issue_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "Issue title",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "repository_not_found");
    assert.equal(result.githubStatus, 404);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_create maps 422 to issue_create_invalid", async () => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/issues")) {
      return {
        ok: false,
        status: 422,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ message: "Validation Failed" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_issue_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "Issue title",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "issue_create_invalid");
    assert.equal(result.githubStatus, 422);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_comment_create returns created comment summary", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/issues/7/comments")) {
      assert.equal(options.method, "POST");
      return {
        ok: true,
        status: 201,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            id: 101,
            body: "Issue comment",
            html_url: "https://github.com/demo-user/demo-repo/issues/7#issuecomment-101",
            user: { login: "demo-user" },
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_issue_comment_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      issueNumber: 7,
      body: "Issue comment",
      confirm: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.comment.id, 101);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_issue_comment_create maps 404 to issue_not_found", async () => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/issues/7/comments")) {
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
    const result = await gateway.github_issue_comment_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      issueNumber: 7,
      body: "Issue comment",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "issue_not_found");
    assert.equal(result.githubStatus, 404);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_create validates branch refs", async () => {
  const gateway = await createGateway();
  await assert.rejects(
    gateway.github_pull_request_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "PR title",
      head: "feature branch",
      base: "main",
      confirm: true,
    }),
    /head must not contain spaces/i,
  );
});

test("github_pull_request_create returns created pull request summary", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/pulls")) {
      assert.equal(options.method, "POST");
      return {
        ok: true,
        status: 201,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            number: 12,
            state: "open",
            title: "PR title",
            body: "PR body",
            user: { login: "demo-user" },
            html_url: "https://github.com/demo-user/demo-repo/pull/12",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            head: { ref: "feature/login" },
            base: { ref: "main" },
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: "clean",
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_pull_request_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "PR title",
      body: "PR body",
      head: "feature/login",
      base: "main",
      confirm: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.pullRequest.number, 12);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_create maps 422 to pull_request_create_invalid", async () => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/pulls")) {
      return {
        ok: false,
        status: 422,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ message: "Validation Failed" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_pull_request_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      title: "PR title",
      head: "feature/login",
      base: "main",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "pull_request_create_invalid");
    assert.equal(result.githubStatus, 422);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_comment_create maps 403 to blocked access denied", async () => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/issues/12/comments")) {
      return {
        ok: false,
        status: 403,
        headers: new Headers(),
        async text() {
          return JSON.stringify({ message: "Resource not accessible by personal access token" });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_pull_request_comment_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      pullNumber: 12,
      body: "PR comment",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "github_repo_access_denied");
    assert.equal(result.githubStatus, 403);
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_review_create returns created review summary", async () => {
  process.env.CODEX_AUTH_GATEWAY_SECRET_GITHUB = JSON.stringify({ token: "demo-token" });
  const gateway = await createGateway();
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/pulls/12/reviews")) {
      assert.equal(options.method, "POST");
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async text() {
          return JSON.stringify({
            id: 303,
            body: "Review comment",
            state: "COMMENTED",
            html_url: "https://github.com/demo-user/demo-repo/pull/12#pullrequestreview-303",
            user: { login: "demo-user" },
            submitted_at: "2026-01-01T00:00:00Z",
          });
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await gateway.github_pull_request_review_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      pullNumber: 12,
      body: "Review comment",
      confirm: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.review.id, 303);
    assert.equal(result.review.state, "COMMENTED");
  } finally {
    global.fetch = originalFetch;
  }
});

test("github_pull_request_review_create maps 404 to pull_request_not_found", async () => {
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
    if (String(url).endsWith("/repos/demo-user/demo-repo/pulls/12/reviews")) {
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
    const result = await gateway.github_pull_request_review_create({
      repositoryUrl: "https://github.com/demo-user/demo-repo",
      pullNumber: 12,
      body: "Review comment",
      confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "pull_request_not_found");
    assert.equal(result.githubStatus, 404);
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

import {
  CAPABILITY_BUNDLES,
  CONNECTOR_HINTS,
  METHODS,
  PROVIDERS,
  STATES,
} from "./constants.js";
import { deleteSecret, getSecret, setSecret } from "./credential-store.js";
import {
  GithubApiError,
  GithubRepoClient,
  parseGithubRepositoryUrl,
} from "./github-repo-client.js";
import { closeLoopbackServer, ensureLoopbackServer } from "./loopback-manager.js";
import { logEvent } from "./logger.js";
import { openPanelInChrome, ensurePanelServer } from "./panel-server.js";
import { listProviderMatrix, PROVIDER_MATRIX } from "./provider-matrix.js";
import { providerRegistry } from "./providers/index.js";
import { PublishService } from "./publish-service.js";
import {
  getProviderState,
  getSession,
  initStateStore,
  removeProviderState,
  removeSession,
  setProviderState,
  setSession,
  updateSession,
} from "./state-store.js";
import { createSessionId } from "./utils.js";

function assertProvider(provider) {
  if (!providerRegistry[provider]) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

function providerResponse(provider, state) {
  const matrix = PROVIDER_MATRIX[provider];
  return {
    provider,
    state: state?.state ?? STATES.UNAUTHENTICATED,
    supportedMethods: matrix.supportedMethods,
    capabilityBundles: matrix.capabilityBundles,
    accountLabel: state?.accountLabel ?? null,
    expiresAt: state?.expiresAt ?? null,
    scopes: state?.capabilities ?? [],
    grantedBundles: state?.grantedBundles ?? [],
    lastValidatedAt: state?.lastValidatedAt ?? null,
    connectorHint: state?.connectorHint ?? CONNECTOR_HINTS.LOCAL,
    nextAction: state?.nextAction ?? "authenticate",
    message: state?.message ?? "No active local credentials.",
  };
}

async function buildStatusView(provider, capabilityBundle) {
  const matrix = PROVIDER_MATRIX[provider];
  const savedState = await getProviderState(provider);
  const secret = await getSecret(provider);
  if (!savedState && !secret) {
    return providerResponse(provider, null);
  }
  if (savedState && !secret) {
    if (capabilityBundle && !hasBundle(savedState, capabilityBundle)) {
      return providerResponse(provider, {
        ...savedState,
        nextAction: "reauth_required",
        message: `Capability bundle ${capabilityBundle} is not granted, and the secret is also missing.`,
      });
    }
    return providerResponse(provider, {
      ...savedState,
      state: STATES.INVALID,
      nextAction: "authenticate",
      message: "Credential metadata exists but secret is missing.",
    });
  }
  if (!savedState && secret) {
    return providerResponse(provider, {
      state: STATES.SAVED,
      grantedBundles: secret.grantedBundles ?? matrix.capabilityBundles,
      accountLabel: null,
      nextAction: "validate_saved_secret",
      message: "Secret exists and can be validated to restore provider state.",
    });
  }
  if (capabilityBundle && !hasBundle(savedState, capabilityBundle)) {
    return providerResponse(provider, {
      ...savedState,
      nextAction: "reauth_required",
      message: `Capability bundle ${capabilityBundle} is not granted.`,
    });
  }
  return providerResponse(provider, savedState);
}

function ensureCapability(provider, capabilityBundle) {
  if (!capabilityBundle) {
    return;
  }
  const matrix = PROVIDER_MATRIX[provider];
  if (!matrix.capabilityBundles.includes(capabilityBundle)) {
    throw new Error(`Unsupported capability bundle ${capabilityBundle} for ${provider}`);
  }
}

function hasBundle(state, capabilityBundle) {
  if (!capabilityBundle) {
    return true;
  }
  return (state?.grantedBundles ?? []).includes(capabilityBundle);
}

function resolveCapabilityBundle(provider, capabilityBundle) {
  return capabilityBundle ?? PROVIDER_MATRIX[provider].defaultBundle;
}

function officialConnectorFor(provider, capabilityBundle) {
  if (provider === PROVIDERS.github) {
    return "@github";
  }
  if (capabilityBundle === CAPABILITY_BUNDLES.GMAIL_BASIC) {
    return "@gmail";
  }
  return "@google-drive";
}

const GITHUB_READ_OPERATION_NAMES = new Set([
  "repository_get",
  "branch_list",
  "pull_request_list",
  "pull_request_get",
  "issue_list",
  "issue_get",
]);

const GITHUB_WRITE_OPERATION_NAMES = new Set([
  "issue_create",
  "issue_comment_create",
  "pull_request_create",
  "pull_request_comment_create",
  "pull_request_review_create",
]);

const GITHUB_LOCAL_OPERATION_NAMES = new Set([
  ...GITHUB_READ_OPERATION_NAMES,
  ...GITHUB_WRITE_OPERATION_NAMES,
]);

const GITHUB_OFFICIAL_PLUGIN_MATRIX = {
  repository_get: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so unauthenticated behavior cannot be stably verified here.",
  },
  branch_list: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so unauthenticated behavior cannot be stably verified here.",
  },
  pull_request_list: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so unauthenticated behavior cannot be stably verified here.",
  },
  pull_request_get: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so unauthenticated behavior cannot be stably verified here.",
  },
  issue_list: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so unauthenticated behavior cannot be stably verified here.",
  },
  issue_get: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so unauthenticated behavior cannot be stably verified here.",
  },
  issue_create: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so write-operation availability cannot be stably verified here.",
  },
  issue_comment_create: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so write-operation availability cannot be stably verified here.",
  },
  pull_request_create: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so write-operation availability cannot be stably verified here.",
  },
  pull_request_comment_create: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so write-operation availability cannot be stably verified here.",
  },
  pull_request_review_create: {
    status: "unknown",
    outcome: "cannot_stably_verify_in_current_thread",
    reason:
      "Official GitHub connector tool surface is not exposed in this thread, so write-operation availability cannot be stably verified here.",
  },
};

function clampLimit(limit, fallback = 20) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.trunc(numeric), 100);
}

function assertGithubReadOperation(operationName) {
  if (!GITHUB_READ_OPERATION_NAMES.has(operationName)) {
    throw new Error(`Unsupported GitHub read operation: ${operationName}`);
  }
}

function assertGithubOperation(operationName) {
  if (!GITHUB_LOCAL_OPERATION_NAMES.has(operationName)) {
    throw new Error(`Unsupported GitHub operation: ${operationName}`);
  }
}

function normalizeGithubScopes(scopes) {
  return Array.isArray(scopes)
    ? scopes.map((scope) => String(scope).trim()).filter(Boolean)
    : [];
}

function hasGithubWriteScope(scopes) {
  const normalized = normalizeGithubScopes(scopes);
  return (
    normalized.length === 0 ||
    normalized.includes("repo") ||
    normalized.includes("public_repo")
  );
}

function summarizeRepository(repository) {
  return {
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    visibility: repository.visibility,
    isPrivate: repository.private,
    owner: {
      login: repository.owner?.login ?? null,
      type: repository.owner?.type ?? null,
    },
    defaultBranch: repository.default_branch,
    htmlUrl: repository.html_url,
    apiUrl: repository.url,
    stats: {
      size: repository.size,
      stargazersCount: repository.stargazers_count,
      watchersCount: repository.watchers_count,
      forksCount: repository.forks_count,
      openIssuesCount: repository.open_issues_count,
    },
  };
}

function summarizeBranch(branch, defaultBranch) {
  return {
    name: branch.name,
    protected: Boolean(branch.protected),
    commitSha: branch.commit?.sha ?? null,
    isDefault: branch.name === defaultBranch,
  };
}

function summarizePullRequest(pr) {
  return {
    number: pr.number,
    state: pr.state,
    title: pr.title,
    author: pr.user?.login ?? null,
    htmlUrl: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    headRef: pr.head?.ref ?? null,
    baseRef: pr.base?.ref ?? null,
    isDraft: Boolean(pr.draft),
  };
}

function summarizePullRequestDetail(pr) {
  return {
    ...summarizePullRequest(pr),
    body: pr.body,
    merged: pr.merged,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state ?? null,
  };
}

function summarizeIssue(issue) {
  return {
    number: issue.number,
    state: issue.state,
    title: issue.title,
    author: issue.user?.login ?? null,
    htmlUrl: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    labels: (issue.labels ?? []).map((label) =>
      typeof label === "string" ? label : label.name,
    ),
  };
}

function summarizeIssueDetail(issue) {
  return {
    ...summarizeIssue(issue),
    body: issue.body,
  };
}

function summarizeComment(comment) {
  return {
    id: comment.id,
    htmlUrl: comment.html_url ?? null,
    author: comment.user?.login ?? null,
    createdAt: comment.created_at ?? null,
    updatedAt: comment.updated_at ?? null,
    body: comment.body ?? null,
  };
}

function summarizeReview(review) {
  return {
    id: review.id,
    htmlUrl: review.html_url ?? null,
    author: review.user?.login ?? null,
    state: review.state ?? null,
    submittedAt: review.submitted_at ?? null,
    body: review.body ?? null,
  };
}

export class AuthGateway {
  constructor({ publishService } = {}) {
    this.publishService =
      publishService ??
      new PublishService({
        validateGithubAuth: async () => this.auth_validate({ provider: PROVIDERS.github }),
      });
  }

  async init() {
    await initStateStore();
  }

  async auth_list_providers() {
    const providers = await Promise.all(
      listProviderMatrix().map(async (item) => {
        return buildStatusView(item.provider);
      }),
    );
    return { providers };
  }

  async auth_capability_matrix() {
    return { providers: listProviderMatrix() };
  }

  async auth_status({ provider, capabilityBundle } = {}) {
    assertProvider(provider);
    ensureCapability(provider, capabilityBundle);
    return buildStatusView(provider, capabilityBundle);
  }

  async auth_begin({ provider, method, capabilityBundle, accountLabel } = {}) {
    assertProvider(provider);
    ensureCapability(provider, capabilityBundle);
    const matrix = PROVIDER_MATRIX[provider];
    if (!matrix.supportedMethods.includes(method)) {
      throw new Error(`Unsupported auth method ${method} for ${provider}`);
    }
    const sessionId = createSessionId();
    const session = {
      provider,
      method,
      capabilityBundle: capabilityBundle ?? matrix.defaultBundle,
      accountLabel: accountLabel ?? null,
      createdAt: new Date().toISOString(),
    };
    if (provider === PROVIDERS.github && method === METHODS.MANUAL_TOKEN) {
      session.requiredFields = ["token"];
      await setSession(sessionId, session);
      return {
        provider,
        state: STATES.UNAUTHENTICATED,
        supportedMethods: matrix.supportedMethods,
        capabilityBundles: matrix.capabilityBundles,
        accountLabel: null,
        nextAction: "submit_manual_token",
        message: "Provide a GitHub personal access token.",
        sessionId,
        requiredFields: session.requiredFields,
      };
    }
    if (provider === PROVIDERS.google && method === METHODS.MANUAL_REFRESH_TOKEN) {
      session.requiredFields = ["clientId", "clientSecret", "refreshToken"];
      await setSession(sessionId, session);
      return {
        provider,
        state: STATES.NOT_CONFIGURED,
        supportedMethods: matrix.supportedMethods,
        capabilityBundles: matrix.capabilityBundles,
        accountLabel: null,
        nextAction: "submit_manual_refresh_token",
        message: "Provide Google OAuth client credentials and a refresh token.",
        sessionId,
        requiredFields: session.requiredFields,
      };
    }
    if (provider === PROVIDERS.google && method === METHODS.BROWSER_OAUTH) {
      session.requiredFields = ["clientId", "clientSecret"];
      await setSession(sessionId, session);
      return {
        provider,
        state: STATES.NOT_CONFIGURED,
        supportedMethods: matrix.supportedMethods,
        capabilityBundles: matrix.capabilityBundles,
        accountLabel: null,
        nextAction: "submit_oauth_client_config",
        message: "Provide Google OAuth client information to start the browser flow.",
        sessionId,
        requiredFields: session.requiredFields,
      };
    }
    throw new Error(`Unsupported session flow for ${provider}/${method}`);
  }

  async auth_complete({ sessionId, payload } = {}) {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const providerImpl = providerRegistry[session.provider];
    if (session.provider === PROVIDERS.github && session.method === METHODS.MANUAL_TOKEN) {
      const result = await providerImpl.validateSecret({ token: payload?.token });
      if (result.state !== STATES.AUTHENTICATED) {
        return {
          ...providerResponse(session.provider, result),
          sessionId,
        };
      }
      await setSecret(session.provider, {
        token: payload.token,
      });
      await setProviderState(session.provider, {
        provider: session.provider,
        state: result.state,
        accountLabel: result.accountLabel,
        grantedBundles: result.grantedBundles,
        lastValidatedAt: result.lastValidatedAt,
        expiresAt: result.expiresAt,
        authMethod: session.method,
        connectorPreference: CONNECTOR_HINTS.LOCAL,
        capabilities: result.capabilities,
        connectorHint: result.connectorHint,
        nextAction: "ready",
        message: result.message,
      });
      await removeSession(sessionId);
      closeLoopbackServer(sessionId);
      return providerResponse(session.provider, {
        ...result,
        nextAction: "ready",
      });
    }
    if (session.provider === PROVIDERS.google && session.method === METHODS.MANUAL_REFRESH_TOKEN) {
      const secret = {
        clientId: payload?.clientId,
        clientSecret: payload?.clientSecret,
        refreshToken: payload?.refreshToken,
        grantedBundles: [session.capabilityBundle],
      };
      const result = await providerImpl.validateSecret(secret, [session.capabilityBundle]);
      if (result.state !== STATES.AUTHENTICATED) {
        return {
          ...providerResponse(session.provider, result),
          sessionId,
        };
      }
      await setSecret(session.provider, secret);
      await setProviderState(session.provider, {
        provider: session.provider,
        state: result.state,
        accountLabel: result.accountLabel,
        grantedBundles: [session.capabilityBundle],
        lastValidatedAt: result.lastValidatedAt,
        expiresAt: result.expiresAt,
        authMethod: session.method,
        connectorPreference: CONNECTOR_HINTS.LOCAL,
        capabilities: result.capabilities,
        connectorHint: result.connectorHint,
        nextAction: "ready",
        message: result.message,
      });
      await removeSession(sessionId);
      closeLoopbackServer(sessionId);
      return providerResponse(session.provider, {
        ...result,
        nextAction: "ready",
      });
    }
    if (session.provider === PROVIDERS.google && session.method === METHODS.BROWSER_OAUTH) {
      if (!session.oauthState) {
        const loopbackPath = "/";
        let redirectUri = payload?.redirectUri;
        let loopbackInfo = null;
        if (!redirectUri) {
          loopbackInfo = await ensureLoopbackServer(sessionId);
          redirectUri = `http://localhost:${loopbackInfo.port}${loopbackPath}`;
        }
        const pending = providerImpl.buildPendingOAuth({
          clientId: payload?.clientId,
          redirectUri,
          bundles: [session.capabilityBundle],
        });
        await setSession(sessionId, {
          ...session,
          clientId: payload?.clientId,
          clientSecret: payload?.clientSecret,
          redirectUri,
          loopbackPath,
          loopbackPort: loopbackInfo?.port ?? null,
          oauthState: pending.oauthState,
          codeVerifier: pending.codeVerifier,
        });
        return {
          provider: session.provider,
          state: STATES.NOT_CONFIGURED,
          supportedMethods: providerImpl.supportedMethods,
          capabilityBundles: providerImpl.capabilityBundles,
          accountLabel: null,
          nextAction: "open_browser_and_wait_for_callback",
          message: "Open the Google authorization URL. After the callback lands, call auth_complete again with the same sessionId.",
          sessionId,
          authorizationUrl: pending.authorizationUrl,
          redirectUri,
          expectedState: pending.oauthState,
        };
      }
      const callbackError = session.oauthCallbackError ?? payload?.error;
      if (callbackError) {
        return {
          provider: session.provider,
          state: STATES.INVALID,
          supportedMethods: providerImpl.supportedMethods,
          capabilityBundles: providerImpl.capabilityBundles,
          accountLabel: null,
          nextAction: "restart_browser_oauth",
          message: `Google OAuth callback returned ${callbackError}.`,
          sessionId,
        };
      }
      const callbackCode = session.oauthCallbackCode ?? payload?.code;
      const callbackState = session.oauthCallbackState ?? payload?.state;
      if (!callbackCode) {
        return {
          provider: session.provider,
          state: STATES.NOT_CONFIGURED,
          supportedMethods: providerImpl.supportedMethods,
          capabilityBundles: providerImpl.capabilityBundles,
          accountLabel: null,
          nextAction: "await_browser_callback",
          message: "Browser authorization is still pending. Complete the Google consent flow and retry auth_complete.",
          sessionId,
          redirectUri: session.redirectUri,
        };
      }
      if (callbackState !== session.oauthState) {
        return {
          provider: session.provider,
          state: STATES.INVALID,
          supportedMethods: providerImpl.supportedMethods,
          capabilityBundles: providerImpl.capabilityBundles,
          accountLabel: null,
          nextAction: "restart_browser_oauth",
          message: "Google OAuth state is invalid.",
          sessionId,
        };
      }
      const completed = await providerImpl.completeOAuth({
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        redirectUri: session.redirectUri,
        code: callbackCode,
        bundles: [session.capabilityBundle],
        codeVerifier: session.codeVerifier,
      });
      if (completed.state !== STATES.AUTHENTICATED) {
        await updateSession(sessionId, (current) => ({
          ...current,
          oauthExchangeFailedAt: new Date().toISOString(),
        }));
        return {
          ...providerResponse(session.provider, completed),
          sessionId,
        };
      }
      await setSecret(session.provider, {
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        refreshToken: completed.secret.refreshToken,
        grantedBundles: completed.grantedBundles,
      });
      await setProviderState(session.provider, {
        provider: session.provider,
        state: completed.state,
        accountLabel: completed.accountLabel,
        grantedBundles: completed.grantedBundles,
        lastValidatedAt: completed.lastValidatedAt,
        expiresAt: completed.expiresAt,
        authMethod: session.method,
        connectorPreference: CONNECTOR_HINTS.LOCAL,
        capabilities: completed.capabilities,
        connectorHint: completed.connectorHint,
        nextAction: "ready",
        message: completed.message,
      });
      await removeSession(sessionId);
      closeLoopbackServer(sessionId);
      return providerResponse(session.provider, {
        ...completed,
        nextAction: "ready",
      });
    }
    throw new Error(`Unsupported completion flow for ${session.provider}/${session.method}`);
  }

  async auth_validate({ provider } = {}) {
    assertProvider(provider);
    const validated = await this.validateStoredSecret(provider);
    return validated.view;
  }

  async auth_status_overview() {
    const providers = await Promise.all(
      listProviderMatrix().map(async (item) => {
        const view = await buildStatusView(item.provider);
        return {
          provider: view.provider,
          state: view.state,
          accountLabel: view.accountLabel,
          grantedBundles: view.grantedBundles,
          lastValidatedAt: view.lastValidatedAt,
          expiresAt: view.expiresAt,
          nextAction: view.nextAction,
          message: view.message,
        };
      }),
    );
    return {
      summary: providers,
      message: "This overview is suitable for login status visualization.",
    };
  }

  async auth_logout({ provider } = {}) {
    assertProvider(provider);
    await removeProviderState(provider);
    try {
      await deleteSecret(provider);
    } catch (error) {
      logEvent("secret_delete_failed", { provider, message: error.message });
    }
    return {
      provider,
      state: STATES.UNAUTHENTICATED,
      supportedMethods: PROVIDER_MATRIX[provider].supportedMethods,
      capabilityBundles: PROVIDER_MATRIX[provider].capabilityBundles,
      accountLabel: null,
      nextAction: "authenticate",
      message: `Logged out local ${provider} credentials.`,
    };
  }

  async auth_resolve_route({
    provider,
    intent,
    capabilityBundle,
    operationName,
    repositoryUrl,
  } = {}) {
    assertProvider(provider);
    const resolvedBundle = resolveCapabilityBundle(provider, capabilityBundle);
    ensureCapability(provider, resolvedBundle);

    if (intent === "publish" && provider !== PROVIDERS.github) {
      throw new Error("publish intent is only supported for github.");
    }

    const requiresFreshValidation =
      intent === "business_operation" || intent === "publish";
    if (requiresFreshValidation) {
      await this.validateStoredSecret(provider);
    }

    const localState = await buildStatusView(provider, resolvedBundle);
    const officialConnector = officialConnectorFor(provider, resolvedBundle);

    if (intent === "login") {
      return {
        provider,
        capabilityBundle: resolvedBundle,
        intent,
        selectedRoute: CONNECTOR_HINTS.LOCAL,
        localState,
        officialConnector,
        nextRequiredUserAction:
          localState.state === STATES.AUTHENTICATED &&
          localState.nextAction !== "reauth_required"
            ? "already_authenticated"
            : "call_auth_begin",
        recommendedLocalTools: ["auth_begin", "auth_complete"],
        message:
          localState.state === STATES.AUTHENTICATED &&
          localState.nextAction !== "reauth_required"
            ? "Local authentication is already available."
            : "Use the local auth gateway to complete login first.",
      };
    }

    if (intent === "status") {
      return {
        provider,
        capabilityBundle: resolvedBundle,
        intent,
        selectedRoute: CONNECTOR_HINTS.LOCAL,
        localState,
        officialConnector,
        nextRequiredUserAction: "call_auth_status",
        recommendedLocalTools: ["auth_status", "auth_status_overview"],
        message: "Login state inspection should use the local auth gateway.",
      };
    }

    if (intent === "validate") {
      return {
        provider,
        capabilityBundle: resolvedBundle,
        intent,
        selectedRoute: CONNECTOR_HINTS.LOCAL,
        localState,
        officialConnector,
        nextRequiredUserAction: "call_auth_validate",
        recommendedLocalTools: ["auth_validate"],
        message: "Credential validation should use the local auth gateway.",
      };
    }

    if (intent === "logout") {
      return {
        provider,
        capabilityBundle: resolvedBundle,
        intent,
        selectedRoute: CONNECTOR_HINTS.LOCAL,
        localState,
        officialConnector,
        nextRequiredUserAction: "call_auth_logout",
        recommendedLocalTools: ["auth_logout"],
        message: "Credential logout should use the local auth gateway.",
      };
    }

    if (intent === "publish") {
      if (localState.state !== STATES.AUTHENTICATED) {
        return {
          provider,
          capabilityBundle: resolvedBundle,
          intent,
          selectedRoute: CONNECTOR_HINTS.BLOCKED,
          localState,
          officialConnector,
          reason: "github_auth_required",
          nextRequiredUserAction: "authenticate_locally_then_publish",
          recommendedLocalTools: ["auth_begin", "auth_complete"],
          message: "GitHub publish requires valid local GitHub authentication first.",
        };
      }
      return {
        provider,
        capabilityBundle: resolvedBundle,
        intent,
        selectedRoute: CONNECTOR_HINTS.LOCAL,
        localState,
        officialConnector,
        nextRequiredUserAction: "call_github_publish_prepare",
        recommendedLocalTools: ["github_publish_prepare", "github_publish_execute"],
        message: "Current-project publish should stay on the local auth gateway path.",
      };
    }

    if (intent === "business_operation") {
      if (provider === PROVIDERS.github) {
        assertGithubOperation(operationName);
        if (!repositoryUrl) {
          throw new Error("repositoryUrl is required for GitHub business operations in v1.");
        }
      }

      const officialCapability =
        provider === PROVIDERS.github && GITHUB_LOCAL_OPERATION_NAMES.has(operationName)
          ? GITHUB_OFFICIAL_PLUGIN_MATRIX[operationName]
          : {
              status: "assumed",
              outcome: "prefer_official_when_available",
              reason: "No local fallback is defined for this provider operation.",
            };

      if (localState.nextAction === "reauth_required") {
        return {
          provider,
          capabilityBundle: resolvedBundle,
          intent,
          operationName: operationName ?? null,
          repositoryUrl: repositoryUrl ?? null,
          selectedRoute: CONNECTOR_HINTS.BLOCKED,
          localState,
          officialConnector,
          officialCapability,
          reason: "capability_not_granted",
          nextRequiredUserAction: "authenticate_locally_for_required_bundle",
          recommendedLocalTools: ["auth_begin", "auth_complete"],
          message: `Local auth exists but ${resolvedBundle} has not been granted yet.`,
        };
      }
      if (localState.state !== STATES.AUTHENTICATED) {
        return {
          provider,
          capabilityBundle: resolvedBundle,
          intent,
          operationName: operationName ?? null,
          repositoryUrl: repositoryUrl ?? null,
          selectedRoute: CONNECTOR_HINTS.BLOCKED,
          localState,
          officialConnector,
          officialCapability,
          reason: `${provider}_auth_required`,
          nextRequiredUserAction: "authenticate_locally_then_retry_business_operation",
          recommendedLocalTools: ["auth_begin", "auth_complete"],
          message:
            officialCapability.status === "unknown"
              ? "Official connector availability could not be stably verified in this thread, and local auth is also not ready."
              : "Complete local authentication first, then retry the business operation.",
        };
      }
      if (
        provider === PROVIDERS.github &&
        GITHUB_WRITE_OPERATION_NAMES.has(operationName) &&
        !hasGithubWriteScope(localState.scopes)
      ) {
        return {
          provider,
          capabilityBundle: resolvedBundle,
          intent,
          operationName,
          repositoryUrl,
          selectedRoute: CONNECTOR_HINTS.BLOCKED,
          localState,
          officialConnector,
          officialCapability,
          reason: "github_scope_missing",
          missingScopes: ["repo or public_repo"],
          nextRequiredUserAction: "reauthenticate_with_write_scope_then_retry",
          recommendedLocalTools: ["auth_begin", "auth_complete"],
          message:
            "Local GitHub auth is available, but the current token does not appear to grant write scopes for GitHub collaboration operations.",
        };
      }
      if (
        provider === PROVIDERS.github &&
        GITHUB_LOCAL_OPERATION_NAMES.has(operationName) &&
        officialCapability.status !== "available_without_login"
      ) {
        const isWriteOperation = GITHUB_WRITE_OPERATION_NAMES.has(operationName);
        return {
          provider,
          capabilityBundle: resolvedBundle,
          intent,
          operationName,
          repositoryUrl,
          selectedRoute: CONNECTOR_HINTS.LOCAL,
          executionChannel: "local_fallback",
          localState,
          officialConnector,
          officialCapability,
          nextRequiredUserAction: isWriteOperation
            ? "call_local_github_write_tool"
            : "call_local_github_read_tool",
          recommendedLocalTools: this.githubToolsForOperation(operationName),
          message:
            isWriteOperation
              ? "Official GitHub connector cannot be relied on for this write operation in the current environment; use the local GitHub fallback."
              : "Official GitHub connector cannot be relied on for this unauthenticated operation in the current environment; use the local GitHub fallback.",
        };
      }
      return {
        provider,
        capabilityBundle: resolvedBundle,
        intent,
        operationName: operationName ?? null,
        repositoryUrl: repositoryUrl ?? null,
        selectedRoute: CONNECTOR_HINTS.OFFICIAL,
        executionChannel: "official",
        localState,
        officialConnector,
        officialCapability,
        nextRequiredUserAction: "use_official_connector",
        recommendedOfficialConnector: officialConnector,
        message: "Business operations should prefer the official connector once local authentication is ready.",
      };
    }

    throw new Error(`Unsupported intent: ${intent}`);
  }

  async github_publish_prepare({ projectPath, repositoryUrl } = {}) {
    return this.publishService.prepare({ projectPath, repositoryUrl });
  }

  async github_publish_execute({
    projectPath,
    repositoryUrl,
    commitMessage,
    confirmStagePreview,
    visibility,
    createRepository,
  } = {}) {
    return this.publishService.execute({
      projectPath,
      repositoryUrl,
      commitMessage,
      confirmStagePreview,
      visibility,
      createRepository,
    });
  }

  async github_repository_get({ repositoryUrl } = {}) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    const repository = await repoClient.getRepository(repoRef.owner, repoRef.repo);
    if (!repository) {
      return this.buildGithubReadBlocked("repository_not_found", "GitHub repository was not found.", {
        repository: repoRef,
      });
    }
    return {
      ok: true,
      status: "completed",
      operationName: "repository_get",
      repository: {
        ...repoRef,
        summary: summarizeRepository(repository),
      },
    };
  }

  async github_branch_list({ repositoryUrl, limit } = {}) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    const repository = await repoClient.getRepository(repoRef.owner, repoRef.repo);
    if (!repository) {
      return this.buildGithubReadBlocked("repository_not_found", "GitHub repository was not found.", {
        repository: repoRef,
      });
    }
    const branches = await repoClient.listBranches(repoRef.owner, repoRef.repo, clampLimit(limit));
    if (!branches) {
      return this.buildGithubReadBlocked("repository_not_found", "GitHub repository was not found.", {
        repository: repoRef,
      });
    }
    return {
      ok: true,
      status: "completed",
      operationName: "branch_list",
      repository: {
        ...repoRef,
        defaultBranch: repository.default_branch,
      },
      branches: branches.map((branch) => summarizeBranch(branch, repository.default_branch)),
    };
  }

  async github_pull_request_list({ repositoryUrl, state, limit } = {}) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    const normalizedState = state ?? "open";
    if (!["open", "closed", "all"].includes(normalizedState)) {
      throw new Error("state must be open, closed, or all.");
    }
    const pulls = await repoClient.listPullRequests(
      repoRef.owner,
      repoRef.repo,
      normalizedState,
      clampLimit(limit),
    );
    if (!pulls) {
      return this.buildGithubReadBlocked("repository_not_found", "GitHub repository was not found.", {
        repository: repoRef,
      });
    }
    return {
      ok: true,
      status: "completed",
      operationName: "pull_request_list",
      repository: repoRef,
      state: normalizedState,
      pullRequests: pulls.map(summarizePullRequest),
    };
  }

  async github_pull_request_get({ repositoryUrl, pullNumber } = {}) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    const normalizedPullNumber = Number(pullNumber);
    if (!Number.isInteger(normalizedPullNumber) || normalizedPullNumber <= 0) {
      throw new Error("pullNumber must be a positive integer.");
    }
    const pullRequest = await repoClient.getPullRequest(
      repoRef.owner,
      repoRef.repo,
      normalizedPullNumber,
    );
    if (!pullRequest) {
      return this.buildGithubReadBlocked(
        "pull_request_not_found",
        "GitHub pull request was not found.",
        {
          repository: repoRef,
          pullNumber: normalizedPullNumber,
        },
      );
    }
    return {
      ok: true,
      status: "completed",
      operationName: "pull_request_get",
      repository: repoRef,
      pullRequest: summarizePullRequestDetail(pullRequest),
    };
  }

  async github_issue_list({ repositoryUrl, state, limit } = {}) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    const normalizedState = state ?? "open";
    if (!["open", "closed", "all"].includes(normalizedState)) {
      throw new Error("state must be open, closed, or all.");
    }
    const issues = await repoClient.listIssues(
      repoRef.owner,
      repoRef.repo,
      normalizedState,
      clampLimit(limit),
    );
    if (!issues) {
      return this.buildGithubReadBlocked("repository_not_found", "GitHub repository was not found.", {
        repository: repoRef,
      });
    }
    return {
      ok: true,
      status: "completed",
      operationName: "issue_list",
      repository: repoRef,
      state: normalizedState,
      issues: issues
        .filter((issue) => !issue.pull_request)
        .map(summarizeIssue),
    };
  }

  async github_issue_get({ repositoryUrl, issueNumber } = {}) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    const normalizedIssueNumber = Number(issueNumber);
    if (!Number.isInteger(normalizedIssueNumber) || normalizedIssueNumber <= 0) {
      throw new Error("issueNumber must be a positive integer.");
    }
    const issue = await repoClient.getIssue(repoRef.owner, repoRef.repo, normalizedIssueNumber);
    if (!issue || issue.pull_request) {
      return this.buildGithubReadBlocked("issue_not_found", "GitHub issue was not found.", {
        repository: repoRef,
        issueNumber: normalizedIssueNumber,
      });
    }
    return {
      ok: true,
      status: "completed",
      operationName: "issue_get",
      repository: repoRef,
      issue: summarizeIssueDetail(issue),
    };
  }

  async github_issue_create({ repositoryUrl, title, body, confirm } = {}) {
    this.assertConfirmed(confirm, "github_issue_create");
    const normalizedTitle = this.requireNonEmptyString(title, "title");
    const normalizedBody = this.optionalString(body);
    const context = await this.createGithubWriteContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    try {
      const issue = await repoClient.createIssue(repoRef.owner, repoRef.repo, {
        title: normalizedTitle,
        body: normalizedBody,
      });
      return {
        ok: true,
        status: "completed",
        operationName: "issue_create",
        repository: repoRef,
        issue: summarizeIssueDetail(issue),
      };
    } catch (error) {
      return this.handleGithubWriteError(error, {
        operationName: "issue_create",
        repository: repoRef,
      });
    }
  }

  async github_issue_comment_create({ repositoryUrl, issueNumber, body, confirm } = {}) {
    this.assertConfirmed(confirm, "github_issue_comment_create");
    const normalizedIssueNumber = this.requirePositiveInteger(issueNumber, "issueNumber");
    const normalizedBody = this.requireNonEmptyString(body, "body");
    const context = await this.createGithubWriteContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    try {
      const comment = await repoClient.createIssueComment(
        repoRef.owner,
        repoRef.repo,
        normalizedIssueNumber,
        { body: normalizedBody },
      );
      return {
        ok: true,
        status: "completed",
        operationName: "issue_comment_create",
        repository: repoRef,
        issueNumber: normalizedIssueNumber,
        comment: summarizeComment(comment),
      };
    } catch (error) {
      return this.handleGithubWriteError(error, {
        operationName: "issue_comment_create",
        repository: repoRef,
        issueNumber: normalizedIssueNumber,
      });
    }
  }

  async github_pull_request_create({ repositoryUrl, title, body, head, base, confirm } = {}) {
    this.assertConfirmed(confirm, "github_pull_request_create");
    const normalizedTitle = this.requireNonEmptyString(title, "title");
    const normalizedHead = this.requireGitRef(head, "head");
    const normalizedBase = this.requireGitRef(base, "base");
    const normalizedBody = this.optionalString(body);
    const context = await this.createGithubWriteContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    try {
      const pullRequest = await repoClient.createPullRequest(repoRef.owner, repoRef.repo, {
        title: normalizedTitle,
        body: normalizedBody,
        head: normalizedHead,
        base: normalizedBase,
      });
      return {
        ok: true,
        status: "completed",
        operationName: "pull_request_create",
        repository: repoRef,
        pullRequest: summarizePullRequestDetail(pullRequest),
      };
    } catch (error) {
      return this.handleGithubWriteError(error, {
        operationName: "pull_request_create",
        repository: repoRef,
      });
    }
  }

  async github_pull_request_comment_create({ repositoryUrl, pullNumber, body, confirm } = {}) {
    this.assertConfirmed(confirm, "github_pull_request_comment_create");
    const normalizedPullNumber = this.requirePositiveInteger(pullNumber, "pullNumber");
    const normalizedBody = this.requireNonEmptyString(body, "body");
    const context = await this.createGithubWriteContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    try {
      const comment = await repoClient.createPullRequestComment(
        repoRef.owner,
        repoRef.repo,
        normalizedPullNumber,
        { body: normalizedBody },
      );
      return {
        ok: true,
        status: "completed",
        operationName: "pull_request_comment_create",
        repository: repoRef,
        pullNumber: normalizedPullNumber,
        comment: summarizeComment(comment),
      };
    } catch (error) {
      return this.handleGithubWriteError(error, {
        operationName: "pull_request_comment_create",
        repository: repoRef,
        pullNumber: normalizedPullNumber,
      });
    }
  }

  async github_pull_request_review_create({ repositoryUrl, pullNumber, body, confirm } = {}) {
    this.assertConfirmed(confirm, "github_pull_request_review_create");
    const normalizedPullNumber = this.requirePositiveInteger(pullNumber, "pullNumber");
    const normalizedBody = this.requireNonEmptyString(body, "body");
    const context = await this.createGithubWriteContext(repositoryUrl);
    if (context.blocked) {
      return context.blocked;
    }
    const { repoRef, repoClient } = context;
    try {
      const review = await repoClient.createPullRequestReview(
        repoRef.owner,
        repoRef.repo,
        normalizedPullNumber,
        { body: normalizedBody },
      );
      return {
        ok: true,
        status: "completed",
        operationName: "pull_request_review_create",
        repository: repoRef,
        pullNumber: normalizedPullNumber,
        review: summarizeReview(review),
      };
    } catch (error) {
      return this.handleGithubWriteError(error, {
        operationName: "pull_request_review_create",
        repository: repoRef,
        pullNumber: normalizedPullNumber,
      });
    }
  }

  async ui_open_panel() {
    const panel = await ensurePanelServer({
      authStatusOverview: () => this.auth_status_overview(),
      authValidate: (args) => this.auth_validate(args),
      authLogout: (args) => this.auth_logout(args),
      githubPublishPrepare: (args) => this.github_publish_prepare(args),
      githubPublishExecute: (args) => this.github_publish_execute(args),
    });
    const openResult = await openPanelInChrome(panel.url);
    return {
      ok: true,
      status: "ready",
      url: panel.url,
      panelToken: panel.panelToken,
      browserLaunch: openResult,
      message: "Local status and publish panel is ready.",
    };
  }

  async validateStoredSecret(provider) {
    const state = await getProviderState(provider);
    const secret = await getSecret(provider);
    if (!state && !secret) {
      return {
        view: providerResponse(provider, null),
        state: null,
        result: null,
        secret: null,
      };
    }
    if (!secret) {
      return {
        view: providerResponse(provider, {
          state: STATES.INVALID,
          message: "Credential metadata exists but secret is missing.",
          nextAction: "authenticate",
        }),
        state: null,
        result: null,
        secret: null,
      };
    }
    const providerImpl = providerRegistry[provider];
    const expectedBundles = state?.grantedBundles ?? PROVIDER_MATRIX[provider].capabilityBundles;
    const result = await providerImpl.validateSecret(secret, expectedBundles);
    const nextState = {
      provider,
      state: result.state,
      accountLabel: result.accountLabel,
      grantedBundles: result.grantedBundles,
      lastValidatedAt: result.lastValidatedAt,
      expiresAt: result.expiresAt,
      authMethod: state?.authMethod ?? "restored",
      connectorPreference: CONNECTOR_HINTS.LOCAL,
      capabilities: result.capabilities,
      connectorHint: result.connectorHint,
      nextAction: result.state === STATES.AUTHENTICATED ? "ready" : "authenticate",
      message: result.message,
    };
    await setProviderState(provider, nextState);
    return {
      view: providerResponse(provider, nextState),
      state: nextState,
      result,
      secret,
    };
  }

  async createGithubReadContext(repositoryUrl) {
    if (!repositoryUrl) {
      throw new Error("repositoryUrl is required.");
    }
    const auth = await this.validateStoredSecret(PROVIDERS.github);
    if (auth.view.state !== STATES.AUTHENTICATED) {
      return {
        blocked: this.buildGithubReadBlocked(
          "github_auth_required",
          "GitHub authentication is required before local GitHub read operations can run.",
          { auth: auth.view },
        ),
      };
    }
    if (!auth.secret?.token) {
      return {
        blocked: this.buildGithubReadBlocked(
          "github_auth_required",
          "GitHub token is not available locally.",
          { auth: auth.view },
        ),
      };
    }
    const repoRef = parseGithubRepositoryUrl(repositoryUrl);
    return {
      auth: auth.view,
      repoRef,
      repoClient: new GithubRepoClient({ token: auth.secret.token }),
    };
  }

  async createGithubWriteContext(repositoryUrl) {
    const context = await this.createGithubReadContext(repositoryUrl);
    if (context.blocked) {
      return context;
    }
    if (!hasGithubWriteScope(context.auth.scopes)) {
      return {
        blocked: this.buildGithubWriteBlocked(
          "github_scope_missing",
          "GitHub token does not grant the write scopes required for this operation.",
          {
            auth: context.auth,
            repository: context.repoRef,
            missingScopes: ["repo or public_repo"],
          },
        ),
      };
    }
    return context;
  }

  buildGithubReadBlocked(reason, message, rest = {}) {
    return {
      ok: false,
      status: "blocked",
      reason,
      message,
      ...rest,
    };
  }

  buildGithubWriteBlocked(reason, message, rest = {}) {
    return {
      ok: false,
      status: "blocked",
      reason,
      message,
      ...rest,
    };
  }

  handleGithubWriteError(error, rest = {}) {
    if (error instanceof GithubApiError) {
      if (error.status === 403) {
        return this.buildGithubWriteBlocked("github_repo_access_denied", error.message, {
          ...rest,
          githubStatus: error.status,
          githubErrorCode: error.code,
        });
      }
      if (error.status === 404) {
        return this.buildGithubWriteBlocked(error.code ?? "repository_not_found", error.message, {
          ...rest,
          githubStatus: error.status,
        });
      }
      if (error.status === 422) {
        return this.buildGithubWriteBlocked(error.code ?? "github_validation_failed", error.message, {
          ...rest,
          githubStatus: error.status,
        });
      }
    }
    throw error;
  }

  githubToolsForOperation(operationName) {
    const map = {
      repository_get: ["github_repository_get"],
      branch_list: ["github_branch_list"],
      pull_request_list: ["github_pull_request_list"],
      pull_request_get: ["github_pull_request_get"],
      issue_list: ["github_issue_list"],
      issue_get: ["github_issue_get"],
      issue_create: ["github_issue_create"],
      issue_comment_create: ["github_issue_comment_create"],
      pull_request_create: ["github_pull_request_create"],
      pull_request_comment_create: ["github_pull_request_comment_create"],
      pull_request_review_create: ["github_pull_request_review_create"],
    };
    return map[operationName] ?? [];
  }

  assertConfirmed(confirm, toolName) {
    if (confirm !== true) {
      throw new Error(`${toolName} requires confirm=true.`);
    }
  }

  requireNonEmptyString(value, fieldName) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      throw new Error(`${fieldName} is required.`);
    }
    return normalized;
  }

  optionalString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  requirePositiveInteger(value, fieldName) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new Error(`${fieldName} must be a positive integer.`);
    }
    return normalized;
  }

  requireGitRef(value, fieldName) {
    const normalized = this.requireNonEmptyString(value, fieldName);
    if (/\s/.test(normalized)) {
      throw new Error(`${fieldName} must not contain spaces.`);
    }
    return normalized;
  }
}

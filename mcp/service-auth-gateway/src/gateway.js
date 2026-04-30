import {
  CAPABILITY_BUNDLES,
  CONNECTOR_HINTS,
  METHODS,
  PROVIDERS,
  STATES,
} from "./constants.js";
import { deleteSecret, getSecret, setSecret } from "./credential-store.js";
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
    const state = await getProviderState(provider);
    const secret = await getSecret(provider);
    if (!state && !secret) {
      return providerResponse(provider, null);
    }
    if (!secret) {
      return providerResponse(provider, {
        state: STATES.INVALID,
        message: "Credential metadata exists but secret is missing.",
        nextAction: "authenticate",
      });
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
    return providerResponse(provider, nextState);
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
}

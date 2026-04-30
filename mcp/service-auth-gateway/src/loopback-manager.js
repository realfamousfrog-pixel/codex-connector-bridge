import http from "node:http";
import { logEvent } from "./logger.js";
import { getSession, removeSession, updateSession } from "./state-store.js";

const activeServers = new Map();

function htmlPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

export async function ensureLoopbackServer(sessionId) {
  if (activeServers.has(sessionId)) {
    return activeServers.get(sessionId);
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const session = await getSession(sessionId);
      if (!session) {
        res.writeHead(410, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlPage("Session expired", "The login session no longer exists."));
        return;
      }
      if (url.pathname !== session.loopbackPath) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlPage("Not found", "This callback path is not active."));
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      await updateSession(sessionId, (current) => ({
        ...current,
        oauthCallbackCode: code,
        oauthCallbackState: state,
        oauthCallbackError: error,
        oauthCallbackReceivedAt: new Date().toISOString(),
      }));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        htmlPage(
          error ? "Authorization failed" : "Authorization received",
          error
            ? `OAuth provider returned ${error}. Return to Codex and inspect the session.`
            : "You can close this tab and return to Codex.",
        ),
      );
      const active = activeServers.get(sessionId);
      if (active) {
        active.server.close();
        activeServers.delete(sessionId);
      }
    } catch (caught) {
      logEvent("loopback_callback_error", { message: caught.message });
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPage("Callback error", "Return to Codex and retry the login flow."));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const info = {
    server,
    host: "127.0.0.1",
    port: address.port,
  };
  activeServers.set(sessionId, info);
  return info;
}

export function closeAllLoopbackServers() {
  for (const { server } of activeServers.values()) {
    server.close();
  }
  activeServers.clear();
}

export function closeLoopbackServer(sessionId) {
  const active = activeServers.get(sessionId);
  if (!active) {
    return;
  }
  active.server.close();
  activeServers.delete(sessionId);
}

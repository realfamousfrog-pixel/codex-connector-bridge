import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuthGateway } from "../src/gateway.js";
import { openUrlInChrome } from "../src/browser-launcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultClientFile =
  "C:/Users/86175/Desktop/client_secret_741047607630-l1o9mg8ki46n4h4idfn2qpob95qcr0iu.apps.googleusercontent.com.json";
const defaultStatusFile = path.join(projectRoot, "data", "google-oauth-live.json");

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function writeStatus(file, payload) {
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const clientFile = getArg("client", defaultClientFile);
  const statusFile = getArg("status", defaultStatusFile);
  const bundle = getArg("bundle", "gmail-basic");

  const raw = await fs.readFile(clientFile, "utf8");
  const cfg = JSON.parse(raw).installed;
  if (!cfg?.client_id || !cfg?.client_secret) {
    throw new Error("Invalid Google OAuth client file.");
  }

  const gateway = new AuthGateway();
  await gateway.init();

  const begin = await gateway.auth_begin({
    provider: "google",
    method: "browser_oauth",
    capabilityBundle: bundle,
  });

  const start = await gateway.auth_complete({
    sessionId: begin.sessionId,
    payload: {
      clientId: cfg.client_id,
      clientSecret: cfg.client_secret,
    },
  });
  const browserLaunch = await openUrlInChrome(start.authorizationUrl);

  await writeStatus(statusFile, {
    phase: "waiting",
    sessionId: begin.sessionId,
    redirectUri: start.redirectUri,
    authorizationUrl: start.authorizationUrl,
    capabilityBundle: bundle,
    browserLaunch,
  });

  for (let i = 0; i < 900; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const final = await gateway.auth_complete({ sessionId: begin.sessionId });
    if (final.nextAction === "await_browser_callback" || final.nextAction === "open_browser_and_wait_for_callback") {
      continue;
    }
    await writeStatus(statusFile, {
      phase: "done",
      sessionId: begin.sessionId,
      redirectUri: start.redirectUri,
      authorizationUrl: start.authorizationUrl,
      capabilityBundle: bundle,
      browserLaunch,
      final,
    });
    return;
  }

  await writeStatus(statusFile, {
    phase: "timeout",
    sessionId: begin.sessionId,
    redirectUri: start.redirectUri,
    authorizationUrl: start.authorizationUrl,
    capabilityBundle: bundle,
    browserLaunch,
  });
}

main().catch(async (error) => {
  try {
    const statusFile = getArg("status", defaultStatusFile);
    await writeStatus(statusFile, {
      phase: "error",
      message: error.message,
      stack: error.stack,
    });
  } catch {}
  console.error(error);
  process.exit(1);
});

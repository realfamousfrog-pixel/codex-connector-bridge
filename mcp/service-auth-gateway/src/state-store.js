import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { resolveDataPath } from "./config.js";

const STATE_FILE = resolveDataPath("state.json");
const SESSION_FILE = resolveDataPath("sessions.json");
const JSON_READ_RETRIES = 3;
const JSON_READ_RETRY_MS = 10;
const fileWriteQueues = new Map();

function cloneFallback(fallback) {
  return JSON.parse(JSON.stringify(fallback));
}

function queueFileWrite(filePath, operation) {
  const previous = fileWriteQueues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  fileWriteQueues.set(filePath, next);
  return next.finally(() => {
    if (fileWriteQueues.get(filePath) === next) {
      fileWriteQueues.delete(filePath);
    }
  });
}

async function waitForPendingWrite(filePath) {
  const pending = fileWriteQueues.get(filePath);
  if (pending) {
    await pending.catch(() => {});
  }
}

async function writeJsonFileAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readJsonFileDirect(filePath, fallback) {
  let lastSyntaxError = null;
  for (let attempt = 0; attempt <= JSON_READ_RETRIES; attempt += 1) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      if (raw.trim() === "") {
        if (attempt === JSON_READ_RETRIES) {
          const nextValue = cloneFallback(fallback);
          await queueFileWrite(filePath, () => writeJsonFileAtomic(filePath, nextValue));
          return nextValue;
        }
        await delay(JSON_READ_RETRY_MS);
        continue;
      }
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === "ENOENT") {
        const nextValue = cloneFallback(fallback);
        await queueFileWrite(filePath, () => writeJsonFileAtomic(filePath, nextValue));
        return nextValue;
      }
      if (error instanceof SyntaxError) {
        lastSyntaxError = error;
        if (attempt === JSON_READ_RETRIES) {
          throw lastSyntaxError;
        }
        await delay(JSON_READ_RETRY_MS);
        continue;
      }
      throw error;
    }
  }
  throw lastSyntaxError ?? new Error(`Unable to read JSON file: ${filePath}`);
}

async function readJsonFile(filePath, fallback) {
  await waitForPendingWrite(filePath);
  return readJsonFileDirect(filePath, fallback);
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await queueFileWrite(filePath, () => writeJsonFileAtomic(filePath, cloneFallback(fallback)));
  }
}

export async function initStateStore() {
  await ensureJsonFile(STATE_FILE, { providers: {} });
  await ensureJsonFile(SESSION_FILE, { sessions: {} });
}

export async function readState() {
  await initStateStore();
  return readJsonFile(STATE_FILE, { providers: {} });
}

export async function writeState(nextState) {
  await queueFileWrite(STATE_FILE, () => writeJsonFileAtomic(STATE_FILE, nextState));
}

export async function getProviderState(provider) {
  const state = await readState();
  return state.providers[provider] ?? null;
}

export async function setProviderState(provider, providerState) {
  await initStateStore();
  await queueFileWrite(STATE_FILE, async () => {
    const state = await readJsonFileDirect(STATE_FILE, { providers: {} });
    state.providers[provider] = providerState;
    await writeJsonFileAtomic(STATE_FILE, state);
  });
}

export async function removeProviderState(provider) {
  await initStateStore();
  await queueFileWrite(STATE_FILE, async () => {
    const state = await readJsonFileDirect(STATE_FILE, { providers: {} });
    delete state.providers[provider];
    await writeJsonFileAtomic(STATE_FILE, state);
  });
}

export async function readSessions() {
  await initStateStore();
  return readJsonFile(SESSION_FILE, { sessions: {} });
}

export async function getSession(sessionId) {
  const sessions = await readSessions();
  return sessions.sessions[sessionId] ?? null;
}

export async function setSession(sessionId, sessionState) {
  await initStateStore();
  await queueFileWrite(SESSION_FILE, async () => {
    const sessions = await readJsonFileDirect(SESSION_FILE, { sessions: {} });
    sessions.sessions[sessionId] = sessionState;
    await writeJsonFileAtomic(SESSION_FILE, sessions);
  });
}

export async function updateSession(sessionId, updater) {
  await initStateStore();
  return queueFileWrite(SESSION_FILE, async () => {
    const sessions = await readJsonFileDirect(SESSION_FILE, { sessions: {} });
    const current = sessions.sessions[sessionId] ?? null;
    sessions.sessions[sessionId] = await updater(current);
    await writeJsonFileAtomic(SESSION_FILE, sessions);
    return sessions.sessions[sessionId];
  });
}

export async function removeSession(sessionId) {
  await initStateStore();
  await queueFileWrite(SESSION_FILE, async () => {
    const sessions = await readJsonFileDirect(SESSION_FILE, { sessions: {} });
    delete sessions.sessions[sessionId];
    await writeJsonFileAtomic(SESSION_FILE, sessions);
  });
}

import fs from "node:fs/promises";
import { resolveDataPath } from "./config.js";

const STATE_FILE = resolveDataPath("state.json");
const SESSION_FILE = resolveDataPath("sessions.json");

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }
}

export async function initStateStore() {
  await ensureJsonFile(STATE_FILE, { providers: {} });
  await ensureJsonFile(SESSION_FILE, { sessions: {} });
}

export async function readState() {
  await initStateStore();
  const raw = await fs.readFile(STATE_FILE, "utf8");
  return JSON.parse(raw);
}

export async function writeState(nextState) {
  await fs.writeFile(STATE_FILE, JSON.stringify(nextState, null, 2), "utf8");
}

export async function getProviderState(provider) {
  const state = await readState();
  return state.providers[provider] ?? null;
}

export async function setProviderState(provider, providerState) {
  const state = await readState();
  state.providers[provider] = providerState;
  await writeState(state);
}

export async function removeProviderState(provider) {
  const state = await readState();
  delete state.providers[provider];
  await writeState(state);
}

export async function readSessions() {
  await initStateStore();
  const raw = await fs.readFile(SESSION_FILE, "utf8");
  return JSON.parse(raw);
}

export async function getSession(sessionId) {
  const sessions = await readSessions();
  return sessions.sessions[sessionId] ?? null;
}

export async function setSession(sessionId, sessionState) {
  const sessions = await readSessions();
  sessions.sessions[sessionId] = sessionState;
  await fs.writeFile(SESSION_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

export async function updateSession(sessionId, updater) {
  const sessions = await readSessions();
  const current = sessions.sessions[sessionId] ?? null;
  sessions.sessions[sessionId] = await updater(current);
  await fs.writeFile(SESSION_FILE, JSON.stringify(sessions, null, 2), "utf8");
  return sessions.sessions[sessionId];
}

export async function removeSession(sessionId) {
  const sessions = await readSessions();
  delete sessions.sessions[sessionId];
  await fs.writeFile(SESSION_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

import crypto from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function addSeconds(dateIso, seconds) {
  return new Date(Date.parse(dateIso) + seconds * 1000).toISOString();
}

export function createSessionId() {
  return crypto.randomUUID();
}

export function redactValue(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function sanitizeForLog(input) {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForLog(item));
  }
  if (!input || typeof input !== "object") {
    return input;
  }
  const secretKeys = new Set([
    "token",
    "accessToken",
    "refreshToken",
    "clientSecret",
    "authorizationCode",
    "code",
  ]);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (secretKeys.has(key)) {
        return [key, redactValue(value)];
      }
      return [key, sanitizeForLog(value)];
    }),
  );
}

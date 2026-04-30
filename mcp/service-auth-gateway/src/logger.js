import { sanitizeForLog } from "./utils.js";

export function logEvent(event, payload = {}) {
  const safe = sanitizeForLog(payload);
  process.stderr.write(`${JSON.stringify({ event, ...safe })}\n`);
}

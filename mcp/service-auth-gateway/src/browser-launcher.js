import { spawn } from "node:child_process";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];

export function getChromeCandidates() {
  return [...CHROME_CANDIDATES];
}

export async function openUrlInChrome(url) {
  const fs = await import("node:fs/promises");
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      const child = spawn(candidate, [url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return { ok: true, browser: "chrome", path: candidate };
    } catch {}
  }
  return {
    ok: false,
    browser: "chrome",
    path: null,
    message: "Chrome executable was not found in the known local paths.",
  };
}

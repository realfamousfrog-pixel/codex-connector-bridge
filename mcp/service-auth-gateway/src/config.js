import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataRoot = process.env.CODEX_AUTH_GATEWAY_DATA_DIR
  ? path.resolve(process.env.CODEX_AUTH_GATEWAY_DATA_DIR)
  : path.join(projectRoot, "data");

export function resolveDataPath(filename) {
  return path.join(dataRoot, filename);
}

export function getProjectRoot() {
  return projectRoot;
}

export function getDataRoot() {
  return dataRoot;
}

import { readFileSync } from "node:fs";
import path from "node:path";

let loaded = false;

export function loadLocalEnv() {
  if (loaded) {
    return;
  }

  loaded = true;

  const envPath = path.join(process.cwd(), ".env");

  try {
    const raw = readFileSync(envPath, "utf8");

    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();

      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

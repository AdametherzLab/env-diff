import * as fs from "fs";
import * as path from "path";
import type { DiffOptions } from "./types.js";

/**
 * Persistent configuration for env-diff.
 * Loaded from `.envdiffrc.json` or the `"envdiff"` key in `package.json`.
 */
export interface EnvDiffConfig {
  ignoreKeys?: string[];
  caseSensitive?: boolean;
  strict?: boolean;
  format?: "table" | "json" | "markdown";
  secretPatterns?: string[];
  compareValues?: boolean;
}

/**
 * Attempts to read and parse a JSON file. Returns undefined on any failure.
 */
function readJsonFile(filePath: string): unknown | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

/**
 * Validates that a parsed value is a plain object (not null, not an array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Loads env-diff configuration from the project directory.
 *
 * Resolution order:
 * 1. `.envdiffrc.json` in the given directory (or process.cwd())
 * 2. `"envdiff"` key in `package.json` in the same directory
 * 3. Empty config `{}` if neither source provides valid configuration
 *
 * Never throws -- returns `{}` on any read/parse failure.
 *
 * @param cwd - Directory to search for config files (defaults to process.cwd())
 * @returns Resolved configuration object
 */
export function loadConfig(cwd?: string): EnvDiffConfig {
  const dir = cwd ?? process.cwd();

  // 1. Try .envdiffrc.json
  const rcPath = path.join(dir, ".envdiffrc.json");
  const rcData = readJsonFile(rcPath);
  if (isPlainObject(rcData)) {
    return rcData as EnvDiffConfig;
  }

  // 2. Try package.json "envdiff" key
  const pkgPath = path.join(dir, "package.json");
  const pkgData = readJsonFile(pkgPath);
  if (isPlainObject(pkgData)) {
    const envdiffSection = (pkgData as Record<string, unknown>)["envdiff"];
    if (isPlainObject(envdiffSection)) {
      return envdiffSection as EnvDiffConfig;
    }
  }

  // 3. No config found
  return {};
}

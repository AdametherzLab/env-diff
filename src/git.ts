import { execFileSync } from "child_process";
import { parseEnvString } from "./parser.js";
import type { EnvMap, ParseOptions } from "./types.js";

/**
 * Checks whether a source string refers to a git ref (contains `:` or `@` separator).
 * Returns false for Windows absolute paths like `C:\path` or `D:\file`.
 */
export function isGitSource(source: string): boolean {
  // Windows absolute path: single letter followed by `:\` or `:/`
  if (/^[A-Za-z]:[\\\/]/.test(source)) {
    return false;
  }
  // Absolute Unix paths with @ in directory names are NOT git sources
  if (source.startsWith("/")) {
    return false;
  }
  // Must match pattern: file:ref or file@ref
  // File part should be a simple relative path (no @), ref should look like a git ref
  // Git refs: branch names, tags, commit hashes (alphanumeric, dashes, dots, slashes, tildes, carets)
  return /^[^:@\/][^:@]*[:@][A-Za-z0-9._\-\/~^]+$/.test(source);
}

/**
 * Splits a git source string into a file path and git ref.
 *
 * Supported formats:
 * - `.env:main`    -> { filePath: ".env", ref: "main" }
 * - `.env@abc123`  -> { filePath: ".env", ref: "abc123" }
 *
 * @throws {Error} If the source cannot be parsed into exactly two parts.
 */
export function parseGitRef(source: string): { filePath: string; ref: string } {
  // Try `:` first, then `@`
  for (const sep of [":", "@"] as const) {
    const idx = source.indexOf(sep);
    if (idx !== -1) {
      const filePath = source.slice(0, idx);
      const ref = source.slice(idx + 1);

      if (!filePath) {
        throw new Error(`Missing file path in git source: "${source}"`);
      }
      if (!ref) {
        throw new Error(`Missing git ref in git source: "${source}"`);
      }

      return { filePath, ref };
    }
  }

  throw new Error(`Cannot parse git source (no ':' or '@' separator found): "${source}"`);
}

/**
 * Loads and parses an .env file from a specific git ref.
 *
 * Runs `git show <ref>:<filePath>` and feeds the result through parseEnvString.
 *
 * @param source - A git source string like `.env:main` or `.env@abc123`
 * @param options - Parsing options forwarded to parseEnvString
 * @returns Parsed environment map from the file at the given ref
 *
 * @throws {Error} If not inside a git repository
 * @throws {Error} If the git ref does not exist
 * @throws {Error} If the file does not exist at the given ref
 */
export function loadGitEnv(source: string, options?: ParseOptions): EnvMap {
  const { filePath, ref } = parseGitRef(source);

  // Normalize path separators to forward slashes for git
  const gitPath = filePath.replace(/\\/g, "/");

  let stdout: string;
  try {
    stdout = execFileSync("git", ["show", `${ref}:${gitPath}`], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("not a git repository")) {
      throw new Error(
        `Not a git repository. Cannot resolve git source "${source}".`
      );
    }

    if (
      message.includes("unknown revision") ||
      message.includes("bad revision")
    ) {
      throw new Error(
        `Git ref "${ref}" not found. Ensure the branch, tag, or commit exists.`
      );
    }

    if (
      message.includes("does not exist in") ||
      message.includes("path") ||
      message.includes("exists on disk, but not in")
    ) {
      throw new Error(
        `File "${filePath}" not found at git ref "${ref}".`
      );
    }

    throw new Error(
      `Failed to load "${filePath}" from git ref "${ref}": ${message}`
    );
  }

  return parseEnvString(stdout, options);
}

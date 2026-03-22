import type { ValueType } from "./types.js";

/**
 * Default glob patterns for detecting secret/sensitive environment variable keys.
 * Each pattern uses `*` as a wildcard matching zero or more characters.
 */
export const DEFAULT_SECRET_PATTERNS: string[] = [
  "*KEY*",
  "*SECRET*",
  "*TOKEN*",
  "*PASSWORD*",
  "*CREDENTIAL*",
  "*AUTH*",
  "*PRIVATE*",
];

/**
 * Converts a glob-style pattern (with `*` wildcards) to a case-insensitive RegExp.
 */
function globToRegex(pattern: string): RegExp {
  // Escape regex special chars except `*`, then replace `*` with `.*`
  const escaped = pattern.replace(/([.+?^${}()|[\]\\])/g, "\\$1");
  // Collapse consecutive wildcards to prevent ReDoS with nested quantifiers
  const regexStr = `^${escaped.replace(/\*+/g, ".*")}$`;
  return new RegExp(regexStr, "i");
}

/**
 * Checks whether an environment variable key matches any of the given secret patterns.
 *
 * @param key - The environment variable name to test
 * @param patterns - Glob patterns to match against (defaults to DEFAULT_SECRET_PATTERNS)
 * @returns True if the key matches at least one pattern
 */
export function isSecretKey(
  key: string,
  patterns: string[] = DEFAULT_SECRET_PATTERNS
): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(key));
}

/**
 * Masks a parsed environment value for safe display.
 *
 * - Strings longer than 4 characters: shows first 4 chars followed by `****`
 * - Strings of 4 characters or fewer: replaced entirely with `****`
 * - Numbers and booleans: converted to their raw/string representation and masked
 * - Empty values: returned unchanged
 *
 * @param value - The parsed ValueType to mask
 * @returns A new ValueType with the value masked as a string kind
 */
export function maskValue(value: ValueType): ValueType {
  if (value.kind === "empty") {
    return value;
  }

  let raw: string;
  switch (value.kind) {
    case "string":
      raw = value.value;
      break;
    case "number":
      raw = value.raw;
      break;
    case "boolean":
      raw = value.raw;
      break;
  }

  if (raw === "") {
    return value;
  }

  const masked =
    raw.length > 4 ? raw.slice(0, 4) + "****" : "****";

  return { kind: "string", value: masked };
}

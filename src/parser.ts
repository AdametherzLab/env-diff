import * as fs from "fs";
import type { EnvMap, ValueType, ParseOptions } from "./types.js";

/**
 * Coerces a raw string value into a discriminated ValueType union.
 * Detects booleans, numbers, empty values, and plain strings.
 */
function coerceValue(raw: string | undefined): ValueType {
  if (raw === undefined || raw === "") {
    return { kind: "empty", value: undefined };
  }

  if (/^(true|yes|on)$/i.test(raw)) {
    return { kind: "boolean", value: true, raw };
  }
  if (/^(false|no|off)$/i.test(raw)) {
    return { kind: "boolean", value: false, raw };
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return { kind: "number", value: parsed, raw };
    }
  }

  return { kind: "string", value: raw };
}

/**
 * Expands variable references ($VAR and ${VAR}) in a string using already-parsed values.
 * Only called for double-quoted and unquoted values (not single-quoted).
 */
function expandVariableRefs(value: string, resolved: Map<string, string>): string {
  // Single-pass replacement for both ${VAR} and $VAR to avoid double-expansion
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_, braced, bare) => {
      const name = braced ?? bare;
      return resolved.get(name) ?? "";
    }
  );
}

/**
 * Gets the raw string representation of a ValueType for variable expansion lookups.
 */
function valueToRaw(vt: ValueType): string {
  switch (vt.kind) {
    case "empty": return "";
    case "string": return vt.value;
    case "number": return vt.raw;
    case "boolean": return vt.raw;
  }
}

/**
 * Parses a .env format string into an EnvMap.
 *
 * Supports:
 * - KEY=value, KEY="quoted", KEY='single quoted', KEY= (empty), export KEY=value
 * - Comment lines (# ...) and blank lines (skipped)
 * - Inline comments for unquoted values (everything after ` #`)
 * - Multiline double-quoted values
 * - Variable expansion (${VAR} and $VAR) when options.expandVariables is true
 * - Strict mode that throws SyntaxError on malformed lines
 */
export function parseEnvString(content: string, options?: ParseOptions): EnvMap {
  const expand = options?.expandVariables === true;
  const strict = options?.strict === true;

  const result: Record<string, ValueType> = {};
  const resolvedRaw = new Map<string, string>(); // for variable expansion

  const lines = content.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    i++;

    // Skip blank lines and comment lines
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    // Strip optional `export ` prefix
    let workLine = trimmed;
    if (workLine.startsWith("export ")) {
      workLine = workLine.slice(7).trimStart();
    }

    // Match KEY=... pattern
    const eqIndex = workLine.indexOf("=");
    if (eqIndex === -1) {
      if (strict) {
        throw new SyntaxError(`Malformed line (no '=' found): ${line}`);
      }
      continue;
    }

    const key = workLine.slice(0, eqIndex).trim();
    if (key === "") {
      if (strict) {
        throw new SyntaxError(`Malformed line (empty key): ${line}`);
      }
      continue;
    }

    let rawValue: string;
    let quoteType: "double" | "single" | "none";
    const afterEq = workLine.slice(eqIndex + 1);

    if (afterEq.startsWith('"')) {
      // Double-quoted value
      quoteType = "double";
      const rest = afterEq.slice(1);
      const closeIdx = rest.indexOf('"');

      if (closeIdx !== -1) {
        // Closing quote on the same line
        rawValue = rest.slice(0, closeIdx);
      } else {
        // Multiline: accumulate until closing "
        const parts: string[] = [rest];
        let found = false;
        while (i < lines.length) {
          const nextLine = lines[i];
          i++;
          const closeInNext = nextLine.indexOf('"');
          if (closeInNext !== -1) {
            parts.push(nextLine.slice(0, closeInNext));
            found = true;
            break;
          } else {
            parts.push(nextLine);
          }
        }
        if (!found && strict) {
          throw new SyntaxError(`Unterminated double-quoted value for key: ${key}`);
        }
        rawValue = parts.join("\n");
      }
    } else if (afterEq.startsWith("'")) {
      // Single-quoted value
      quoteType = "single";
      const rest = afterEq.slice(1);
      const closeIdx = rest.indexOf("'");
      if (closeIdx !== -1) {
        rawValue = rest.slice(0, closeIdx);
      } else {
        if (strict) {
          throw new SyntaxError(`Unterminated single-quoted value for key: ${key}`);
        }
        // Take everything after the opening quote
        rawValue = rest;
      }
    } else {
      // Unquoted value
      quoteType = "none";
      // Strip inline comments: ` #` (space + hash)
      const commentIdx = afterEq.indexOf(" #");
      if (commentIdx !== -1) {
        rawValue = afterEq.slice(0, commentIdx).trim();
      } else {
        rawValue = afterEq.trim();
      }
    }

    // Variable expansion: only for double-quoted and unquoted values
    if (expand && quoteType !== "single") {
      rawValue = expandVariableRefs(rawValue, resolvedRaw);
    }

    const valueType = coerceValue(rawValue);
    result[key] = valueType;
    resolvedRaw.set(key, valueToRaw(valueType));
  }

  return result;
}

/**
 * Reads a .env file from disk and parses it into an EnvMap.
 *
 * @param filePath - Absolute or relative path to the .env file
 * @param options - Parsing options (encoding defaults to utf-8)
 * @returns Parsed environment map
 */
export function parseEnvFile(filePath: string, options?: ParseOptions): EnvMap {
  const encoding = options?.encoding ?? "utf-8";
  const content = fs.readFileSync(filePath, encoding as BufferEncoding);
  return parseEnvString(content, options);
}

/**
 * Reads the current process.env and converts it into an EnvMap.
 * Filters out entries with undefined values and coerces each value.
 */
export function parseProcessEnv(): EnvMap {
  const result: Record<string, ValueType> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = coerceValue(value);
    }
  }
  return result;
}

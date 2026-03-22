import * as fs from "fs";
import * as path from "path";

/** Directories to skip during recursive scanning */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

/** Default file extensions to scan */
const DEFAULT_EXTENSIONS = [".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs"];

/** Regex patterns for environment variable references */
const ENV_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\[["']([A-Z_][A-Z0-9_]*)["']\]/g,
  /Bun\.env\.([A-Z_][A-Z0-9_]*)/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
];

/**
 * Recursively collects file paths matching the given extensions,
 * skipping directories in the SKIP_DIRS set.
 */
function collectFiles(
  directory: string,
  extensions: string[],
  results: string[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        collectFiles(fullPath, extensions, results);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
}

/**
 * Scans a codebase for environment variable references.
 *
 * Recursively walks files matching the given extensions (default: .ts, .js, .tsx, .jsx, .mjs, .cjs),
 * skipping node_modules/, dist/, .git/, and coverage/ directories.
 *
 * @param directory - Root directory to scan
 * @param extensions - File extensions to include (with leading dot)
 * @returns Map of variable name to array of file paths where it is referenced
 */
export function scanForEnvVars(
  directory: string,
  extensions: string[] = DEFAULT_EXTENSIONS
): Map<string, string[]> {
  const filePaths: string[] = [];
  collectFiles(directory, extensions, filePaths);

  const varMap = new Map<string, string[]>();

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const relativePath = path.relative(directory, filePath).replace(/\\/g, "/");

    for (const pattern of ENV_PATTERNS) {
      // Reset lastIndex since the regex is global
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const varName = match[1];
        const existing = varMap.get(varName);
        if (existing) {
          if (!existing.includes(relativePath)) {
            existing.push(relativePath);
          }
        } else {
          varMap.set(varName, [relativePath]);
        }
      }
    }
  }

  return varMap;
}

/**
 * Generates .env.example content from scanned environment variable references.
 *
 * For each variable, adds a comment listing the files that reference it.
 * If existing .env.example content is provided, preserves known values.
 * Output is sorted alphabetically by variable name.
 *
 * @param vars - Map of variable name to referencing file paths
 * @param existing - Optional existing .env.example content to preserve values from
 * @returns Formatted .env.example file content
 */
export function generateEnvExample(
  vars: Map<string, string[]>,
  existing?: string
): string {
  // Parse existing values if provided
  const existingValues = new Map<string, string>();
  if (existing) {
    for (const line of existing.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1);
        existingValues.set(key, value);
      }
    }
  }

  const sortedKeys = Array.from(vars.keys()).sort();
  const lines: string[] = [];

  for (const key of sortedKeys) {
    const files = vars.get(key)!;
    lines.push(`# Referenced in: ${files.join(", ")}`);
    const value = existingValues.get(key) ?? "";
    lines.push(`${key}=${value}`);
    lines.push("");
  }

  return lines.join("\n");
}

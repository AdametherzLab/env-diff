#!/usr/bin/env node
import * as path from "path";
import * as fs from "fs";
import * as url from "url";
import type { DiffResult, DiffEntry, DiffOptions, EnvMap, ValueType } from "./types.js";
import { parseEnvFile, parseProcessEnv } from "./parser.js";
import { diffEnvironmentMaps } from "./differ.js";
import { formatTable, formatJson, formatMarkdown, formatSummary, formatValue } from "./formatters.js";
import { isGitSource, loadGitEnv } from "./git.js";
import { loadConfig } from "./config.js";
import type { EnvDiffConfig } from "./config.js";
import { isSecretKey, maskValue } from "./secrets.js";
import { scanForEnvVars, generateEnvExample } from "./scan.js";
import { syncEnvFiles } from "./sync.js";
import { compareMatrix, renderMatrixTable } from "./matrix.js";
import { watchEnvFiles } from "./watcher.js";

const Colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
} as const;

type OutputFormat = "table" | "json" | "markdown" | "summary";

interface CliArgs {
  mode: "compare" | "scan" | "scan-write" | "sync" | "sync-write" | "matrix" | "install-hook";
  /** Positional file arguments */
  positional: string[];
  strict: boolean;
  ignoreKeys: string[];
  compareValues: boolean;
  format: OutputFormat;
  mask: boolean;
  unmask: boolean;
  watch: boolean;
  /** Directory for scan modes */
  scanDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const ignoreKeys: string[] = [];
  let strict = false;
  let compareValues = true;
  let format: OutputFormat = "table";
  let mask = false;
  let unmask = false;
  let watch = false;
  let mode: CliArgs["mode"] = "compare";
  let scanDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--strict") {
      strict = true;
    } else if (arg === "--ignore") {
      const next = argv[++i];
      if (next === undefined) throw new Error("--ignore requires a key argument");
      ignoreKeys.push(next);
    } else if (arg === "--no-value-diff") {
      compareValues = false;
    } else if (arg === "--format") {
      const next = argv[++i];
      if (next !== "table" && next !== "json" && next !== "markdown" && next !== "summary") {
        throw new Error("--format must be 'table', 'json', 'markdown', or 'summary'");
      }
      format = next;
    } else if (arg === "--mask") {
      mask = true;
    } else if (arg === "--unmask") {
      unmask = true;
    } else if (arg === "--watch") {
      watch = true;
    } else if (arg === "--scan") {
      mode = "scan";
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        scanDir = next;
        i++;
      }
    } else if (arg === "--scan-write") {
      mode = "scan-write";
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        scanDir = next;
        i++;
      }
    } else if (arg === "--sync") {
      mode = "sync";
    } else if (arg === "--sync-write") {
      mode = "sync-write";
    } else if (arg === "--matrix") {
      mode = "matrix";
    } else if (arg === "--install-hook") {
      mode = "install-hook";
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  // Validate positional args based on mode
  if (mode === "compare" || mode === "sync" || mode === "sync-write") {
    if (positional.length !== 2) {
      throw new Error(
        "Expected exactly 2 arguments: <left-source> <right-source>\n" +
        "Usage: env-diff <left> <right> [--strict] [--ignore KEY] [--no-value-diff] [--format table|json|markdown|summary] [--mask] [--watch]\n\n" +
        "Subcommands:\n" +
        "  env-diff --scan [dir]                  Scan codebase for env var references\n" +
        "  env-diff --scan-write [dir]             Scan and write .env.example\n" +
        "  env-diff <left> <right> --sync          Show sync patch\n" +
        "  env-diff <left> <right> --sync-write    Apply sync patch\n" +
        "  env-diff --matrix <file1> <file2> ...   Matrix comparison\n" +
        "  env-diff --install-hook                 Install pre-commit hook"
      );
    }
  } else if (mode === "matrix") {
    if (positional.length < 2) {
      throw new Error("--matrix requires at least 2 file arguments");
    }
  }

  return { mode, positional, strict, ignoreKeys, compareValues, format, mask, unmask, watch, scanDir };
}

function loadEnvironment(source: string): EnvMap {
  if (source === "process.env") {
    return parseProcessEnv();
  }

  if (isGitSource(source)) {
    return loadGitEnv(source);
  }

  const fullPath = path.resolve(source);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Environment file not found: ${source}`);
  }
  return parseEnvFile(fullPath);
}

/**
 * Applies masking to secret values in diff entries.
 * Returns a new DiffResult with masked values where applicable.
 */
function applyMasking(result: DiffResult, secretPatterns?: string[]): DiffResult {
  const maskedEntries = result.entries.map((entry) => {
    if (!isSecretKey(entry.key, secretPatterns)) {
      return entry;
    }
    return {
      ...entry,
      left: entry.left ? maskValue(entry.left) : entry.left,
      right: entry.right ? maskValue(entry.right) : entry.right,
    } as DiffEntry;
  });

  return {
    ...result,
    entries: maskedEntries,
  };
}

function formatOutput(result: DiffResult, format: OutputFormat): string {
  switch (format) {
    case "table":
      return formatTable(result);
    case "json":
      return formatJson(result);
    case "markdown":
      return formatMarkdown(result);
    case "summary":
      return formatSummary(result);
  }
}

function handleScan(scanDir: string | undefined): number {
  const dir = path.resolve(scanDir ?? ".");
  const vars = scanForEnvVars(dir);

  if (vars.size === 0) {
    console.log("No environment variable references found.");
    return 0;
  }

  console.log(`Found ${vars.size} environment variables:\n`);
  const sorted = Array.from(vars.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, files] of sorted) {
    console.log(`  ${key}`);
    for (const file of files) {
      console.log(`    - ${file}`);
    }
  }

  return 0;
}

function handleScanWrite(scanDir: string | undefined): number {
  const dir = path.resolve(scanDir ?? ".");
  const vars = scanForEnvVars(dir);

  if (vars.size === 0) {
    console.log("No environment variable references found. Nothing to write.");
    return 0;
  }

  const examplePath = path.join(dir, ".env.example");
  let existing: string | undefined;
  try {
    existing = fs.readFileSync(examplePath, "utf-8");
  } catch {
    // No existing file
  }

  const content = generateEnvExample(vars, existing);
  fs.writeFileSync(examplePath, content, "utf-8");
  console.log(`Wrote ${vars.size} variables to ${examplePath}`);
  return 0;
}

function handleSync(left: string, right: string): number {
  const result = syncEnvFiles(path.resolve(left), path.resolve(right));
  if (!result.hasChanges) {
    console.log(Colors.green + "Files are in sync. No changes needed." + Colors.reset);
    return 0;
  }
  console.log("Sync patch:\n");
  console.log(result.patch);
  console.log(`\n${result.added.length} additions, ${result.removed.length} removals`);
  return 0;
}

function handleSyncWrite(left: string, right: string): number {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  const result = syncEnvFiles(leftPath, rightPath);

  if (!result.hasChanges) {
    console.log(Colors.green + "Files are in sync. No changes needed." + Colors.reset);
    return 0;
  }

  // Read existing right file content and append missing keys
  let existing = "";
  try {
    existing = fs.readFileSync(rightPath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  if (result.added.length > 0) {
    const leftEnv = loadEnvironment(left);
    const additions = result.added
      .map((key) => {
        const val = leftEnv[key];
        if (!val || val.kind === "empty") return `${key}=`;
        if (val.kind === "string") return `${key}=${val.value}`;
        return `${key}=${val.raw}`;
      })
      .join("\n");

    const separator = existing.endsWith("\n") || existing === "" ? "" : "\n";
    fs.writeFileSync(rightPath, existing + separator + additions + "\n", "utf-8");
    console.log(`Added ${result.added.length} keys to ${rightPath}`);
  }

  if (result.removed.length > 0) {
    console.log(`Note: ${result.removed.length} extra keys in target not removed (manual review recommended):`);
    for (const key of result.removed) {
      console.log(`  - ${key}`);
    }
  }

  return 0;
}

function handleMatrix(files: string[], format: OutputFormat, options?: DiffOptions): number {
  const resolved = files.map((f) => path.resolve(f));
  const matrix = compareMatrix(resolved, options);

  if (format === "json") {
    console.log(JSON.stringify(matrix, null, 2));
  } else {
    console.log(renderMatrixTable(matrix));
    console.log(`\nTotal: ${matrix.totalErrors} error pairs, ${matrix.totalWarnings} warning pairs`);
  }

  return matrix.totalErrors > 0 ? 1 : 0;
}

function handleInstallHook(): number {
  const gitDir = path.resolve(".git");
  if (!fs.existsSync(gitDir)) {
    console.error(Colors.red + "Error: Not a git repository (no .git directory found)" + Colors.reset);
    return 1;
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, "pre-commit");
  const hookContent = `#!/bin/sh
# env-diff pre-commit hook
# Checks that .env files are in sync before committing

if [ -f .env.example ] && [ -f .env ]; then
  npx env-diff .env.example .env --strict
  if [ $? -ne 0 ]; then
    echo "env-diff: Environment files are out of sync. Fix errors before committing."
    exit 1
  fi
fi
`;

  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
  console.log(Colors.green + `Pre-commit hook installed at ${hookPath}` + Colors.reset);
  return 0;
}

/**
 * Execute the env-diff CLI.
 * @param argv - Command line arguments (defaults to process.argv.slice(2))
 * @returns Exit code (0 for success, 1 for failure)
 * @example
 * // Programmatic usage in tests:
 * const exitCode = runCli([".env.example", ".env.production", "--strict"]);
 * assert.strictEqual(exitCode, 0);
 */
export function runCli(argv: string[] = process.argv.slice(2)): number {
  try {
    const args = parseArgs(argv);

    // Load project config and merge (CLI args take precedence)
    const config = loadConfig();
    const strict = args.strict || config.strict === true;
    const ignoreKeys = [...(config.ignoreKeys ?? []), ...args.ignoreKeys];
    const compareValues = args.compareValues && (config.compareValues !== false);
    const format = args.format !== "table" ? args.format : (config.format as OutputFormat ?? "table");
    const shouldMask = args.mask || (!args.unmask && (config.secretPatterns !== undefined && config.secretPatterns.length > 0));

    // Handle subcommands
    if (args.mode === "scan") {
      return handleScan(args.scanDir);
    }
    if (args.mode === "scan-write") {
      return handleScanWrite(args.scanDir);
    }
    if (args.mode === "install-hook") {
      return handleInstallHook();
    }

    if (args.mode === "sync") {
      return handleSync(args.positional[0], args.positional[1]);
    }
    if (args.mode === "sync-write") {
      return handleSyncWrite(args.positional[0], args.positional[1]);
    }

    const diffOptions: DiffOptions = {
      ignoreKeys,
      compareValues,
    };

    if (args.mode === "matrix") {
      return handleMatrix(args.positional, format, diffOptions);
    }

    // Default: compare two files
    const leftEnv = loadEnvironment(args.positional[0]);
    const rightEnv = loadEnvironment(args.positional[1]);

    let result = diffEnvironmentMaps(leftEnv, rightEnv, args.positional[0], args.positional[1], diffOptions);

    // Apply masking if requested
    if (shouldMask) {
      result = applyMasking(result, config.secretPatterns);
    }

    // Watch mode
    if (args.watch) {
      const leftPath = path.resolve(args.positional[0]);
      const rightPath = path.resolve(args.positional[1]);

      // Initial output
      const output = formatOutput(result, format);
      console.log(output);
      if (format === "table") {
        console.log("\nenv-diff by AdametherzLab | Built with Claude\n");
      }
      console.log(Colors.cyan + "Watching for changes... (Ctrl+C to stop)" + Colors.reset);

      watchEnvFiles(leftPath, rightPath, {
        ...diffOptions,
        onDiff: (watchResult) => {
          let masked = watchResult;
          if (shouldMask) {
            masked = applyMasking(masked, config.secretPatterns);
          }
          console.clear();
          console.log(formatOutput(masked, format));
          if (format === "table") {
            console.log("\nenv-diff by AdametherzLab | Built with Claude\n");
          }
          console.log(Colors.cyan + "Watching for changes... (Ctrl+C to stop)" + Colors.reset);
        },
      });

      // Keep process alive
      return 0;
    }

    // Standard output
    const output = formatOutput(result, format);
    console.log(output);

    if (format === "table") {
      console.log("\nenv-diff by AdametherzLab | Built with Claude\n");
    }

    return strict && result.hasErrors ? 1 : 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(Colors.red + `Error: ${msg}` + Colors.reset);
    return 1;
  }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}

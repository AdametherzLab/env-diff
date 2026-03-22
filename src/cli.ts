import * as path from "path";
import * as fs from "fs";
import * as url from "url";
import type { DiffResult, DiffEntry, DiffOptions, EnvMap, ValueType } from "./types.js";
import { parseEnvFile, parseProcessEnv } from "./parser.js";
import { diffEnvironmentMaps } from "./differ.js";

const Colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
} as const;

function formatValue(value: ValueType | undefined): string {
  if (value === undefined) return "(undefined)";
  if (value.kind === "empty") return "(empty)";
  const str = value.kind === "string" ? value.value : value.raw;
  return str.length > 30 ? str.slice(0, 27) + "..." : str;
}

function getColor(entry: DiffEntry): string {
  if (entry.severity === "error") return Colors.red;
  if (entry.severity === "warning") return Colors.yellow;
  if (entry.status === "unchanged") return Colors.green;
  return Colors.reset;
}

function renderTable(result: DiffResult): void {
  const entries = result.entries;
  const keyWidth = Math.max(3, ...entries.map(e => e.key.length));
  const leftWidth = Math.max(result.leftLabel.length, ...entries.map(e => formatValue(e.left).length));
  const rightWidth = Math.max(result.rightLabel.length, ...entries.map(e => formatValue(e.right).length));
  const statusWidth = Math.max(6, ...entries.map(e => e.status.length));
  
  const line = `+${"-".repeat(keyWidth + 2)}+${"-".repeat(leftWidth + 2)}+${"-".repeat(rightWidth + 2)}+${"-".repeat(statusWidth + 2)}+`;
  
  console.log(Colors.cyan + line + Colors.reset);
  console.log(Colors.cyan + `| ${"KEY".padEnd(keyWidth)} | ${result.leftLabel.padEnd(leftWidth)} | ${result.rightLabel.padEnd(rightWidth)} | ${"STATUS".padEnd(statusWidth)} |` + Colors.reset);
  console.log(Colors.cyan + line + Colors.reset);
  
  for (const entry of entries) {
    const color = getColor(entry);
    console.log(`${color}| ${entry.key.padEnd(keyWidth)} | ${formatValue(entry.left).padEnd(leftWidth)} | ${formatValue(entry.right).padEnd(rightWidth)} | ${entry.status.padEnd(statusWidth)} |${Colors.reset}`);
  }
  
  console.log(Colors.cyan + line + Colors.reset);
  
  if (result.hasErrors) {
    console.log(Colors.red + "\n✖ Environment check failed with errors" + Colors.reset);
  } else if (result.hasWarnings) {
    console.log(Colors.yellow + "\n⚠ Environment check completed with warnings" + Colors.reset);
  } else {
    console.log(Colors.green + "\n✓ Environment check passed" + Colors.reset);
  }
}

function parseArgs(argv: string[]): { left: string; right: string; strict: boolean; ignoreKeys: string[]; compareValues: boolean } {
  const positional: string[] = [];
  const ignoreKeys: string[] = [];
  let strict = false;
  let compareValues = true;
  
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
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  
  if (positional.length !== 2) {
    throw new Error("Expected exactly 2 arguments: <left-source> <right-source>\nUsage: env-diff <left> <right> [--strict] [--ignore KEY] [--no-value-diff]");
  }
  
  return { left: positional[0], right: positional[1], strict, ignoreKeys, compareValues };
}

function loadEnvironment(source: string): EnvMap {
  if (source === "process.env") {
    return parseProcessEnv();
  }
  
  const fullPath = path.resolve(source);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Environment file not found: ${source}`);
  }
  return parseEnvFile(fullPath);
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
    const leftEnv = loadEnvironment(args.left);
    const rightEnv = loadEnvironment(args.right);
    
    const options: DiffOptions = {
      ignoreKeys: args.ignoreKeys,
      compareValues: args.compareValues,
    };
    
    const result = diffEnvironmentMaps(leftEnv, rightEnv, args.left, args.right, options);
    renderTable(result);
    
    return args.strict && result.hasErrors ? 1 : 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(Colors.red + `Error: ${msg}` + Colors.reset);
    return 1;
  }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}
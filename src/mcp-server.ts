#!/usr/bin/env node
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { parseEnvString, parseEnvFile } from "./parser.js";
import { diffEnvironmentMaps } from "./differ.js";
import { scanForEnvVars, generateEnvExample } from "./scan.js";
import { syncEnvFiles } from "./sync.js";
import { isSecretKey, maskValue } from "./secrets.js";
import type { EnvMap } from "./types.js";

const SERVER_INFO = {
  name: "env-diff",
  version: "0.2.0",
  vendor: "AdametherzLab",
};

const TOOLS = [
  {
    name: "env_diff_compare",
    description:
      "Compare two .env files or content strings to detect missing, modified, or type-mismatched variables",
    inputSchema: {
      type: "object" as const,
      properties: {
        left: {
          type: "string",
          description: "Path to left .env file or raw .env content",
        },
        right: {
          type: "string",
          description: "Path to right .env file or raw .env content",
        },
        leftLabel: {
          type: "string",
          description: "Label for left source",
          default: "left",
        },
        rightLabel: {
          type: "string",
          description: "Label for right source",
          default: "right",
        },
        ignoreKeys: {
          type: "array",
          items: { type: "string" },
          description: "Keys to ignore during comparison",
        },
        maskSecrets: {
          type: "boolean",
          description: "Mask secret values in output",
          default: true,
        },
      },
      required: ["left", "right"],
    },
  },
  {
    name: "env_diff_scan",
    description:
      "Scan a codebase directory for environment variable references (process.env, Bun.env, import.meta.env)",
    inputSchema: {
      type: "object" as const,
      properties: {
        directory: {
          type: "string",
          description: "Directory to scan for env var references",
        },
        extensions: {
          type: "array",
          items: { type: "string" },
          description:
            "File extensions to scan (e.g. [\".ts\", \".js\"]). Defaults to .ts, .js, .tsx, .jsx, .mjs, .cjs",
        },
      },
      required: ["directory"],
    },
  },
  {
    name: "env_diff_sync",
    description:
      "Generate a sync patch showing missing variables between a source (template) and target .env file",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Path to source .env file (template)",
        },
        target: {
          type: "string",
          description: "Path to target .env file",
        },
        write: {
          type: "boolean",
          description:
            "If true, append missing variables to the target file. Default: false (dry run)",
          default: false,
        },
      },
      required: ["source", "target"],
    },
  },
];

// --- JSON-RPC transport ---

function send(msg: object): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

// --- Helpers ---

/**
 * Determines whether a string looks like a file path (exists on disk)
 * or is raw .env content.
 */
function resolveEnvInput(input: string): EnvMap {
  // If the string contains newlines it is almost certainly raw content
  if (input.includes("\n")) {
    return parseEnvString(input);
  }
  // Try as a file path
  try {
    if (fs.existsSync(input) && fs.statSync(input).isFile()) {
      return parseEnvFile(input);
    }
  } catch {
    // Fall through to raw parse
  }
  // Treat as raw content (could be a single-line env like "FOO=bar")
  return parseEnvString(input);
}

/**
 * Optionally masks secret values in an EnvMap, returning a new map.
 */
function applySecretMasking(envMap: EnvMap, mask: boolean): EnvMap {
  if (!mask) return envMap;
  const result: Record<string, (typeof envMap)[string]> = {};
  for (const [key, value] of Object.entries(envMap)) {
    result[key] = isSecretKey(key) ? maskValue(value) : value;
  }
  return result;
}

// --- Tool handlers ---

function handleCompare(args: Record<string, unknown>): unknown {
  const left = String(args.left);
  const right = String(args.right);
  const leftLabel = typeof args.leftLabel === "string" ? args.leftLabel : "left";
  const rightLabel =
    typeof args.rightLabel === "string" ? args.rightLabel : "right";
  const ignoreKeys = Array.isArray(args.ignoreKeys)
    ? (args.ignoreKeys as string[])
    : [];
  const maskSecrets = args.maskSecrets !== false; // default true

  let leftMap = resolveEnvInput(left);
  let rightMap = resolveEnvInput(right);

  if (maskSecrets) {
    leftMap = applySecretMasking(leftMap, true);
    rightMap = applySecretMasking(rightMap, true);
  }

  const result = diffEnvironmentMaps(leftMap, rightMap, leftLabel, rightLabel, {
    ignoreKeys,
    compareValues: true,
  });

  // Return the structured result (formatJson parses it back, so build directly)
  const summary = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
    typeMismatch: 0,
  };
  for (const entry of result.entries) {
    switch (entry.status) {
      case "added":
        summary.added++;
        break;
      case "removed":
        summary.removed++;
        break;
      case "modified":
        summary.modified++;
        break;
      case "unchanged":
        summary.unchanged++;
        break;
      case "type-mismatch":
        summary.typeMismatch++;
        break;
    }
  }

  return {
    leftLabel: result.leftLabel,
    rightLabel: result.rightLabel,
    hasErrors: result.hasErrors,
    hasWarnings: result.hasWarnings,
    summary,
    entries: result.entries,
  };
}

function handleScan(args: Record<string, unknown>): unknown {
  const directory = String(args.directory);
  const extensions = Array.isArray(args.extensions)
    ? (args.extensions as string[])
    : undefined;

  const vars = scanForEnvVars(directory, extensions);
  const envExample = generateEnvExample(vars);

  // Convert Map to plain object for JSON serialization
  const references: Record<string, string[]> = {};
  for (const [key, files] of vars) {
    references[key] = files;
  }

  return {
    directory,
    variableCount: vars.size,
    references,
    envExample,
  };
}

function handleSync(args: Record<string, unknown>): unknown {
  const source = String(args.source);
  const target = String(args.target);
  const write = args.write === true;

  const result = syncEnvFiles(source, target);

  // If write mode is requested and there are additions, append them to target
  if (write && result.added.length > 0) {
    const sourceMap = parseEnvFile(source);
    const lines: string[] = [];
    for (const key of result.added) {
      const val = sourceMap[key];
      let raw = "";
      if (val !== undefined) {
        switch (val.kind) {
          case "string":
            raw = val.value;
            break;
          case "number":
            raw = val.raw;
            break;
          case "boolean":
            raw = val.raw;
            break;
          case "empty":
            raw = "";
            break;
        }
      }
      lines.push(`${key}=${raw}`);
    }

    const existing = fs.existsSync(target)
      ? fs.readFileSync(target, "utf-8")
      : "";
    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(target, existing + separator + lines.join("\n") + "\n");
  }

  return {
    source,
    target,
    written: write,
    hasChanges: result.hasChanges,
    added: result.added,
    removed: result.removed,
    patch: result.patch,
  };
}

function handleToolCall(
  name: string,
  args: Record<string, unknown>
): unknown {
  switch (name) {
    case "env_diff_compare":
      return handleCompare(args);
    case "env_diff_scan":
      return handleScan(args);
    case "env_diff_sync":
      return handleSync(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Main loop ---

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line: string) => {
  let msg: { id?: number | string; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(line);
  } catch {
    // Ignore unparseable input
    return;
  }

  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
      break;

    case "notifications/initialized":
      // Notification — no response required
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
      break;

    case "tools/call": {
      const toolName = (params as Record<string, unknown>)?.name as string;
      const toolArgs =
        ((params as Record<string, unknown>)?.arguments as Record<string, unknown>) ?? {};
      try {
        const result = handleToolCall(toolName, toolArgs);
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          },
        });
      } catch (err: unknown) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          },
        });
      }
      break;
    }

    default:
      // Unknown method — return error per JSON-RPC spec
      if (id !== undefined) {
        send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        });
      }
      break;
  }
});

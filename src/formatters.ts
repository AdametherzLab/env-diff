import type { DiffResult, DiffEntry, ValueType } from "./types.js";

const Colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
} as const;

/**
 * Formats a parsed ValueType for display, truncating strings longer than 30 characters.
 */
export function formatValue(value: ValueType | undefined): string {
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

function countByStatus(entries: ReadonlyArray<DiffEntry>): {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  typeMismatch: number;
} {
  let added = 0, removed = 0, modified = 0, unchanged = 0, typeMismatch = 0;
  for (const e of entries) {
    switch (e.status) {
      case "added": added++; break;
      case "removed": removed++; break;
      case "modified": modified++; break;
      case "unchanged": unchanged++; break;
      case "type-mismatch": typeMismatch++; break;
    }
  }
  return { added, removed, modified, unchanged, typeMismatch };
}

/**
 * Renders a DiffResult as an ANSI-colored table string.
 * Includes a summary status line at the end.
 */
export function formatTable(result: DiffResult): string {
  const entries = result.entries;
  const keyWidth = Math.max(3, ...entries.map((e) => e.key.length));
  const leftWidth = Math.max(
    result.leftLabel.length,
    ...entries.map((e) => formatValue(e.left).length)
  );
  const rightWidth = Math.max(
    result.rightLabel.length,
    ...entries.map((e) => formatValue(e.right).length)
  );
  const statusWidth = Math.max(6, ...entries.map((e) => e.status.length));

  const line = `+${"-".repeat(keyWidth + 2)}+${"-".repeat(leftWidth + 2)}+${"-".repeat(rightWidth + 2)}+${"-".repeat(statusWidth + 2)}+`;

  const lines: string[] = [];
  lines.push(Colors.cyan + line + Colors.reset);
  lines.push(
    Colors.cyan +
      `| ${"KEY".padEnd(keyWidth)} | ${result.leftLabel.padEnd(leftWidth)} | ${result.rightLabel.padEnd(rightWidth)} | ${"STATUS".padEnd(statusWidth)} |` +
      Colors.reset
  );
  lines.push(Colors.cyan + line + Colors.reset);

  for (const entry of entries) {
    const color = getColor(entry);
    lines.push(
      `${color}| ${entry.key.padEnd(keyWidth)} | ${formatValue(entry.left).padEnd(leftWidth)} | ${formatValue(entry.right).padEnd(rightWidth)} | ${entry.status.padEnd(statusWidth)} |${Colors.reset}`
    );
  }

  lines.push(Colors.cyan + line + Colors.reset);

  if (result.hasErrors) {
    lines.push(Colors.red + "\n\u2716 Environment check failed with errors" + Colors.reset);
  } else if (result.hasWarnings) {
    lines.push(Colors.yellow + "\n\u26A0 Environment check completed with warnings" + Colors.reset);
  } else {
    lines.push(Colors.green + "\n\u2713 Environment check passed" + Colors.reset);
  }

  return lines.join("\n");
}

/**
 * Renders a DiffResult as a JSON string with enriched metadata.
 */
export function formatJson(result: DiffResult): string {
  const summary = countByStatus(result.entries);
  const enriched = {
    generator: "env-diff by AdametherzLab",
    leftLabel: result.leftLabel,
    rightLabel: result.rightLabel,
    hasErrors: result.hasErrors,
    hasWarnings: result.hasWarnings,
    summary,
    entries: result.entries,
  };
  return JSON.stringify(enriched, null, 2);
}

/**
 * Renders a DiffResult as a markdown table.
 */
export function formatMarkdown(result: DiffResult): string {
  const lines: string[] = [];
  lines.push("| Key | Left | Right | Status | Severity |");
  lines.push("|-----|------|-------|--------|----------|");

  for (const entry of result.entries) {
    const left = formatValue(entry.left);
    const right = formatValue(entry.right);
    lines.push(
      `| ${entry.key} | ${left} | ${right} | ${entry.status} | ${entry.severity} |`
    );
  }

  return lines.join("\n");
}

/**
 * Renders a one-line summary of a DiffResult.
 */
export function formatSummary(result: DiffResult): string {
  const counts = countByStatus(result.entries);
  const errors = counts.removed + counts.typeMismatch;
  const warnings = counts.added + counts.modified;
  const ok = counts.unchanged;

  if (errors === 0 && warnings === 0) {
    return `\u2713 ${ok} keys matched`;
  }

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} errors`);
  if (warnings > 0) parts.push(`${warnings} warnings`);
  if (ok > 0) parts.push(`${ok} unchanged`);

  return `\u2716 ${parts.join(", ")}`;
}

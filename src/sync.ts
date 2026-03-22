import { parseEnvFile } from "./parser.js";
import type { EnvMap, ValueType } from "./types.js";

/**
 * Describes the result of a sync operation between two .env files.
 */
export interface SyncResult {
  /** Keys that were added to the target */
  readonly added: string[];
  /** Keys that were removed from the target */
  readonly removed: string[];
  /** The generated patch content (human-readable) */
  readonly patch: string;
  /** Whether any changes were detected */
  readonly hasChanges: boolean;
}

/**
 * Computes the sync patch between a source (left) and target (right) .env file.
 *
 * The patch describes what keys need to be added to or removed from the target
 * to match the source's key set. Values from the source are used for additions.
 *
 * @param leftPath - Path to the source/reference .env file
 * @param rightPath - Path to the target .env file to sync
 * @returns SyncResult describing the changes needed
 */
export function syncEnvFiles(leftPath: string, rightPath: string): SyncResult {
  const left = parseEnvFile(leftPath);

  let right: EnvMap;
  try {
    right = parseEnvFile(rightPath);
  } catch {
    right = {};
  }

  const leftKeys = new Set(Object.keys(left));
  const rightKeys = new Set(Object.keys(right));

  const added: string[] = [];
  const removed: string[] = [];
  const patchLines: string[] = [];

  // Keys in left but not in right -> need to be added
  for (const key of leftKeys) {
    if (!rightKeys.has(key)) {
      added.push(key);
      const val = left[key];
      const raw = formatRawValue(val);
      patchLines.push(`+ ${key}=${raw}`);
    }
  }

  // Keys in right but not in left -> candidates for removal
  for (const key of rightKeys) {
    if (!leftKeys.has(key)) {
      removed.push(key);
      patchLines.push(`- ${key}`);
    }
  }

  const patch = patchLines.length > 0
    ? patchLines.join("\n")
    : "No changes needed.";

  return {
    added,
    removed,
    patch,
    hasChanges: added.length > 0 || removed.length > 0,
  };
}

function formatRawValue(value: ValueType | undefined): string {
  if (value === undefined) return "";
  switch (value.kind) {
    case "empty":
      return "";
    case "string":
      return value.value;
    case "number":
      return value.raw;
    case "boolean":
      return value.raw;
  }
}

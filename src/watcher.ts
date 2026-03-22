import * as fs from "fs";
import { parseEnvFile } from "./parser.js";
import { diffEnvironmentMaps } from "./differ.js";
import type { DiffOptions } from "./types.js";
import type { DiffResult } from "./types.js";

/**
 * Options for watchEnvFiles, extending DiffOptions with a change callback.
 */
export interface WatchOptions extends DiffOptions {
  /** Callback invoked whenever a diff is detected after a file change */
  readonly onDiff?: (result: DiffResult) => void;
}

/** Handle returned by watchEnvFiles to control the watcher lifecycle */
export interface WatchHandle {
  /** Stops watching both files and cleans up resources */
  stop: () => void;
}

/** Debounce interval in milliseconds */
const DEBOUNCE_MS = 500;

/** Polling interval for fs.watchFile */
const POLL_INTERVAL_MS = 1000;

/**
 * Watches two .env files for changes and re-diffs them on every modification.
 *
 * Uses fs.watchFile with polling (more reliable cross-platform than fs.watch).
 * Debounces rapid changes: skips re-diff if less than 500ms since the last run.
 *
 * @param leftPath - Path to the left/source .env file
 * @param rightPath - Path to the right/target .env file
 * @param options - Diff options plus an optional onDiff callback
 * @returns Handle with a stop() method to cease watching
 */
export function watchEnvFiles(
  leftPath: string,
  rightPath: string,
  options?: WatchOptions
): WatchHandle {
  const { onDiff, ...diffOptions } = options ?? {};
  let lastRunTimestamp = 0;

  function runDiff(): void {
    const now = Date.now();
    if (now - lastRunTimestamp < DEBOUNCE_MS) {
      return;
    }
    lastRunTimestamp = now;

    try {
      const left = parseEnvFile(leftPath);
      const right = parseEnvFile(rightPath);
      const result = diffEnvironmentMaps(left, right, leftPath, rightPath, diffOptions);

      if (onDiff) {
        onDiff(result);
      }
    } catch (err: unknown) {
      // Only silence filesystem errors (file mid-write, temporarily unavailable)
      // Rethrow programming errors to avoid silent failures
      if (err instanceof Error && "code" in err) {
        // Filesystem error — safe to skip this cycle
      } else {
        console.error("env-diff watch error:", err);
      }
    }
  }

  const listener = (): void => {
    runDiff();
  };

  fs.watchFile(leftPath, { interval: POLL_INTERVAL_MS }, listener);
  fs.watchFile(rightPath, { interval: POLL_INTERVAL_MS }, listener);

  return {
    stop(): void {
      fs.unwatchFile(leftPath, listener);
      fs.unwatchFile(rightPath, listener);
    },
  };
}

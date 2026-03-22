import { parseEnvFile } from "./parser.js";
import { diffEnvironmentMaps } from "./differ.js";
import type { DiffOptions, DiffResult, EnvMap } from "./types.js";

/**
 * Result of a pairwise matrix comparison across multiple .env files.
 */
export interface MatrixResult {
  /** Labels (file paths) for each file in the matrix */
  readonly labels: string[];
  /** Pairwise diff results indexed as [leftIdx][rightIdx] */
  readonly comparisons: ReadonlyArray<ReadonlyArray<DiffResult | null>>;
  /** Summary counts: total errors and warnings across all pairs */
  readonly totalErrors: number;
  readonly totalWarnings: number;
}

/**
 * Compares multiple .env files against each other in a pairwise matrix.
 *
 * @param filePaths - Array of file paths to compare (minimum 2)
 * @param options - Diff options applied to each pairwise comparison
 * @returns MatrixResult containing all pairwise comparisons
 * @throws {Error} If fewer than 2 files are provided
 */
export function compareMatrix(
  filePaths: string[],
  options?: DiffOptions
): MatrixResult {
  if (filePaths.length < 2) {
    throw new Error("Matrix comparison requires at least 2 files");
  }

  const envMaps: EnvMap[] = filePaths.map((fp) => parseEnvFile(fp));

  let totalErrors = 0;
  let totalWarnings = 0;

  const comparisons: (DiffResult | null)[][] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const row: (DiffResult | null)[] = [];
    for (let j = 0; j < filePaths.length; j++) {
      if (i === j) {
        row.push(null);
      } else {
        const result = diffEnvironmentMaps(
          envMaps[i],
          envMaps[j],
          filePaths[i],
          filePaths[j],
          options
        );
        if (result.hasErrors) totalErrors++;
        if (result.hasWarnings) totalWarnings++;
        row.push(result);
      }
    }
    comparisons.push(row);
  }

  return { labels: filePaths, comparisons, totalErrors, totalWarnings };
}

/**
 * Renders a matrix comparison result as a human-readable ANSI table.
 *
 * @param matrix - The MatrixResult from compareMatrix
 * @returns Formatted string suitable for terminal output
 */
export function renderMatrixTable(matrix: MatrixResult): string {
  const { labels, comparisons } = matrix;
  const lines: string[] = [];

  // Header
  const colWidth = Math.max(12, ...labels.map((l) => l.length + 2));
  const header =
    "".padEnd(colWidth) + labels.map((l) => l.padEnd(colWidth)).join("");
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (let i = 0; i < labels.length; i++) {
    let row = labels[i].padEnd(colWidth);
    for (let j = 0; j < labels.length; j++) {
      const result = comparisons[i][j];
      if (result === null) {
        row += "--".padEnd(colWidth);
      } else {
        const errors = result.entries.filter((e) => e.severity === "error").length;
        const warnings = result.entries.filter((e) => e.severity === "warning").length;
        const cell =
          errors > 0
            ? `${errors}E ${warnings}W`
            : warnings > 0
              ? `${warnings}W`
              : "OK";
        row += cell.padEnd(colWidth);
      }
    }
    lines.push(row);
  }

  return lines.join("\n");
}

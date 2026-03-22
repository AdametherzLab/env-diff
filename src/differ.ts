import type { EnvMap, DiffResult, DiffEntry, DiffOptions, DiffStatus, Severity, ValueType } from "./types.js";

interface KeyComparison {
  readonly leftKey?: string;
  readonly rightKey?: string;
  readonly leftValue?: ValueType;
  readonly rightValue?: ValueType;
}

/**
 * Performs a bidirectional diff between two environment maps.
 * Detects added, removed, modified, and type-mismatched variables.
 * 
 * @param left - Source environment map (e.g., .env.example)
 * @param right - Target environment map (e.g., .env.production)
 * @param leftLabel - Display label for the left/source side
 * @param rightLabel - Display label for the right/target side
 * @param options - Configuration options for comparison behavior
 * @returns Complete diff result with entries and severity flags
 * @throws {TypeError} If labels are empty or whitespace-only strings
 * @example
 * const result = diffEnvironmentMaps(
 *   { SERVICE: "local", PORT: 3000, DEBUG: true },
 *   { service: "production", PORT: "3000", HOST: "0.0.0.0" },
 *   ".env.development",
 *   ".env.production",
 *   { caseSensitive: false, compareValues: true }
 * );
 */
export function diffEnvironmentMaps(
  left: EnvMap,
  right: EnvMap,
  leftLabel: string,
  rightLabel: string,
  options: DiffOptions = {}
): DiffResult {
  if (!leftLabel.trim() || !rightLabel.trim()) {
    throw new TypeError("Environment labels must be non-empty strings");
  }

  const { ignoreKeys = [], caseSensitive = true, compareValues = true } = options;

  const normalizeKey = (key: string): string => 
    caseSensitive ? key : key.toLowerCase();

  const ignoredSet = new Set(ignoreKeys.map(normalizeKey));
  const comparisons = new Map<string, KeyComparison>();

  // Index left side
  for (const [key, value] of Object.entries(left)) {
    const normalized = normalizeKey(key);
    if (ignoredSet.has(normalized)) continue;
    
    const existing = comparisons.get(normalized);
    comparisons.set(normalized, {
      ...existing,
      leftKey: key,
      leftValue: value
    });
  }

  // Index right side
  for (const [key, value] of Object.entries(right)) {
    const normalized = normalizeKey(key);
    if (ignoredSet.has(normalized)) continue;
    
    const existing = comparisons.get(normalized);
    comparisons.set(normalized, {
      ...existing,
      rightKey: key,
      rightValue: value
    });
  }

  const entries: DiffEntry[] = [];

  for (const [, data] of comparisons) {
    const entry = classifyDifference(data, compareValues);
    entries.push(entry);
  }

  // Stable alphabetical sort by key name
  entries.sort((a, b) => a.key.localeCompare(b.key));

  const hasErrors = entries.some(entry => entry.severity === "error");
  const hasWarnings = !hasErrors && entries.some(entry => entry.severity === "warning");

  return {
    entries,
    leftLabel,
    rightLabel,
    hasErrors,
    hasWarnings
  } satisfies DiffResult;
}

function classifyDifference(
  data: KeyComparison,
  compareValues: boolean
): DiffEntry {
  const { leftKey, rightKey, leftValue, rightValue } = data;

  // Prefer left key for display, fallback to right
  const key = leftKey ?? rightKey ?? "";
  const hasLeft = leftKey !== undefined;
  const hasRight = rightKey !== undefined;

  let status: DiffStatus;
  let severity: Severity;

  if (hasLeft && !hasRight) {
    // Present in source, absent in target
    status = "removed";
    severity = "error";
  } else if (!hasLeft && hasRight) {
    // Absent in source, present in target
    status = "added";
    severity = "warning";
  } else if (hasLeft && hasRight) {
    // Present in both - check types and values
    const leftType = typeof leftValue;
    const rightType = typeof rightValue;

    if (leftType !== rightType) {
      status = "type-mismatch";
      severity = "error";
    } else if (compareValues && leftValue !== rightValue) {
      status = "modified";
      severity = "warning";
    } else {
      status = "unchanged";
      severity = "info";
    }
  } else {
    // Both undefined (should not occur due to filtering)
    status = "unchanged";
    severity = "info";
  }

  return {
    key,
    left: leftValue,
    right: rightValue,
    status,
    severity
  } satisfies DiffEntry;
}
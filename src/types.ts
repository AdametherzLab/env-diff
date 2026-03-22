/**
 * Discriminated union representing the inferred runtime type of an environment variable value.
 * Distinguishes between string literals, numeric values, boolean flags, and empty/undefined states.
 */
export type ValueType =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly value: number; readonly raw: string }
  | { readonly kind: "boolean"; readonly value: boolean; readonly raw: string }
  | { readonly kind: "empty"; readonly value: undefined };

/**
 * Immutable record of parsed environment variables.
 * Keys represent variable names; values contain type-discriminated parsed content.
 */
export type EnvMap = Readonly<Record<string, ValueType>>;

/**
 * Classification of differences detected between two environment sources.
 * - `added`: Key exists in target but not in source
 * - `removed`: Key exists in source but not in target
 * - `modified`: Key exists in both with different values (same type)
 * - `unchanged`: Key exists in both with identical values
 * - `type-mismatch`: Key exists in both but with incompatible types (e.g., string vs number)
 */
export type DiffStatus = "added" | "removed" | "modified" | "unchanged" | "type-mismatch";

/**
 * Severity levels for CI/CD gating and reporting.
 * - `error`: Deployment-blocking issues (missing required keys, type mismatches)
 * - `warning`: Changes requiring human review (value modifications)
 * - `info`: Non-blocking informational differences
 */
export type Severity = "error" | "warning" | "info";

/**
 * Single comparison result for a specific environment variable key.
 * Captures the delta between left (source) and right (target) environments.
 */
export interface DiffEntry {
  /** Environment variable name (e.g., "DATABASE_URL") */
  readonly key: string;

  /** Parsed value from the left/source side; undefined if key absent */
  readonly left: ValueType | undefined;

  /** Parsed value from the right/target side; undefined if key absent */
  readonly right: ValueType | undefined;

  /** Category of difference detected */
  readonly status: DiffStatus;

  /** Criticality level for determining CI exit codes */
  readonly severity: Severity;
}

/**
 * Complete output of an environment comparison operation.
 * Contains all entries plus aggregate metadata for reporting.
 */
export interface DiffResult {
  /** All compared keys, including unchanged values */
  readonly entries: ReadonlyArray<DiffEntry>;

  /** Display label for the left/source environment (e.g., ".env.example") */
  readonly leftLabel: string;

  /** Display label for the right/target environment (e.g., ".env.production") */
  readonly rightLabel: string;

  /** True if any entry has `error` severity */
  readonly hasErrors: boolean;

  /** True if any entry has `warning` severity (and no errors) */
  readonly hasWarnings: boolean;
}

/**
 * Configuration for parsing .env file contents.
 * Controls encoding, variable expansion, and validation strictness.
 */
export interface ParseOptions {
  /** Character encoding for file read operations */
  readonly encoding?: BufferEncoding;

  /** Whether to treat empty strings ("") as valid values vs. empty/undefined */
  readonly allowEmptyValues?: boolean;

  /** Whether to interpolate variable references like ${VAR} or $VAR */
  readonly expandVariables?: boolean;

  /** Whether to throw on malformed lines vs. skip silently */
  readonly strict?: boolean;
}

/**
 * Configuration for comparing two environment sources.
 * Controls filtering, matching behavior, and failure thresholds.
 */
export interface DiffOptions {
  /** Keys to exclude from comparison (e.g., ["NODE_ENV", "PRIVATE_KEY"]) */
  readonly ignoreKeys?: ReadonlyArray<string>;

  /** Whether key matching is case-sensitive; affects "Missing" detection */
  readonly caseSensitive?: boolean;

  /** Whether to compare actual values or only presence and types */
  readonly compareValues?: boolean;

  /** Minimum severity that causes process.exit(1) in CI mode */
  readonly failOnSeverity?: Severity;
}
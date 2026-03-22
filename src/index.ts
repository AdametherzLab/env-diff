// Existing
export { parseEnvString, parseEnvFile, parseProcessEnv } from "./parser.js";
export { diffEnvironmentMaps as diffEnvMaps, diffEnvironmentMaps } from "./differ.js";
export { runCli } from "./cli.js";

// New
export { isGitSource, parseGitRef, loadGitEnv } from "./git.js";
export { isSecretKey, maskValue, DEFAULT_SECRET_PATTERNS } from "./secrets.js";
export { loadConfig } from "./config.js";
export type { EnvDiffConfig } from "./config.js";
export { scanForEnvVars, generateEnvExample } from "./scan.js";
export { syncEnvFiles } from "./sync.js";
export type { SyncResult } from "./sync.js";
export { compareMatrix, renderMatrixTable } from "./matrix.js";
export type { MatrixResult } from "./matrix.js";
export { watchEnvFiles } from "./watcher.js";
export { formatTable, formatJson, formatMarkdown, formatSummary, formatValue } from "./formatters.js";

// Types
export type { ValueType, EnvMap, DiffEntry, DiffResult, DiffStatus, Severity, ParseOptions, DiffOptions } from "./types.js";

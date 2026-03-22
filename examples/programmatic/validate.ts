/**
 * Example: Pre-deployment environment validation
 *
 * Run: bun run validate.ts
 * Or:  npx tsx validate.ts
 */
import { parseEnvFile, parseProcessEnv, diffEnvMaps } from "@adametherzlab/env-diff";
import * as path from "path";

// Parse the template and current runtime environment
const template = parseEnvFile(path.join(process.cwd(), ".env.example"));
const runtime = parseProcessEnv();

// Compare
const result = diffEnvMaps(template, runtime, ".env.example", "process.env", {
  compareValues: false, // Only check key existence and types
});

// Report critical issues
const critical = result.entries.filter((e) => e.severity === "error");

if (critical.length > 0) {
  console.error(`Missing ${critical.length} required environment variables:`);
  for (const entry of critical) {
    console.error(`  - ${entry.key} (${entry.status})`);
  }
  process.exit(1);
}

console.log("Environment validation passed.");

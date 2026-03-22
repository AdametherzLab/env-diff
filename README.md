[![CI](https://github.com/AdametherzLab/env-diff/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/env-diff/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# 🔍 env-diff

## ✨ Features

- ✅ **Bidirectional diffing** — detects added, removed, modified, and type-mismatched variables
- ✅ **Type coercion detection** — catches when `PORT=3000` (number) becomes `PORT="3000"` (string)
- ✅ **Process environment comparison** — diff `.env.example` against `process.env` to find drift
- ✅ **CI/CD ready** — strict mode with configurable exit codes for automated gating
- ✅ **Zero dependencies** — pure TypeScript/Node.js, runs in Bun or Node 20+

## 📦 Installation

```bash
npm install @adametherzlab/env-diff
# or
bun add @adametherzlab/env-diff
```

## 🚀 Quick Start

**CLI — compare two files:**
```bash
npx @adametherzlab/env-diff .env.example .env.production --strict
```

**Programmatic — validate before deployment:**
```typescript
// REMOVED external import: import { parseEnvFile, diffEnvMaps } from "@adametherzlab/env-diff";

const example = parseEnvFile(".env.example");
const current = parseProcessEnv();

const result = diffEnvMaps(example, current, "Template", "Runtime");
if (result.hasErrors) {
  console.error("Environment drift detected!");
  process.exit(1);
}
```

## 🖥️ CLI Usage

Compare two environment files:
```bash
env-diff .env.development .env.production
```

```bash
env-diff .env.example --process
```

### Flags

| Flag | Description |
|------|-------------|
| `--strict` | Exit with code 1 if any errors (missing keys, type mismatches) are detected |
| `--ignore <keys>` | Comma-separated list of variable names to ignore (e.g., `NODE_ENV,PATH`) |
| `--no-value-diff` | Only check for key existence and type compatibility, ignore value changes |
| `--format <type>` | Output format: `table` (default) or `json` |

## 📚 API Reference

### `parseEnvString(content: string, options?: ParseOptions): EnvMap`

Parses raw .env content into a typed map with automatic type coercion (numbers, booleans, strings).

**Parameters:**
- `content` — Raw string content of a .env file
- `options` — Optional parsing configuration (encoding, variable expansion)

**Returns:** `EnvMap` — Immutable record of variable names to typed values

**Example:**
```typescript
const env = parseEnvString("PORT=3000\nDEBUG=true");
// { PORT: { type: "number", value: 3000 }, DEBUG: { type: "boolean", value: true } }
```

### `parseEnvFile(filePath: string, options?: ParseOptions): EnvMap`

Reads and parses a .env file from disk.

**Parameters:**
- `filePath` — Absolute or relative path to the .env file
- `options` — Optional parsing configuration

**Returns:** `EnvMap`

**Throws:** `Error` if file not found or unreadable; `SyntaxError` if strict mode enabled and content malformed

**Example:**
```typescript
const prodEnv = parseEnvFile(path.join(process.cwd(), ".env.production"));
```

### `parseProcessEnv(): EnvMap`

Wraps `process.env` into a typed `EnvMap`, filtering undefined values and coercing types.

**Returns:** `EnvMap` representing the current process environment

**Example:**
```typescript
const runtimeEnv = parseProcessEnv();
```

### `diffEnvMaps(left: EnvMap, right: EnvMap, leftLabel: string, rightLabel: string, options?: DiffOptions): DiffResult`

**Parameters:**
- `left` — Source environment map (e.g., `.env.example`)
- `right` — Target environment map (e.g., `.env.production`)
- `leftLabel` — Display label for the left/source side
- `rightLabel` — Display label for the right/target side
- `options` — Comparison configuration (case sensitivity, value comparison)

**Returns:** `DiffResult` — Complete comparison results with severity flags

**Example:**
```typescript
const result = diffEnvMaps(
  { API_KEY: "dev-key", PORT: 3000 },
  { api_key: "prod-key", PORT: "3000", HOST: "0.0.0.0" },
  "Development",
  "Production",
  { caseSensitive: false, compareValues: true }
);
```

### `runCli(argv?: string[]): number`

Execute the env-diff CLI programmatically.

**Parameters:**
- `argv` — Command line arguments (defaults to `process.argv.slice(2)`)

**Returns:** `number` — Exit code (0 for success, 1 for failure)

**Example:**
```typescript
const exitCode = runCli([".env.example", ".env.production", "--strict"]);
assert.strictEqual(exitCode, 0);
```

## 🔧 Advanced Usage

Pre-deployment validation in a Node.js script:

```typescript
// REMOVED external import: import { parseEnvFile, parseProcessEnv, diffEnvMaps } from "@adametherzlab/env-diff";
import * as path from "path";

function validateEnvironment(): void {
  const required = parseEnvFile(path.join(process.cwd(), ".env.example"));
  const current = parseProcessEnv();
  
  const diff = diffEnvMaps(
    required, 
    current, 
    "Required (.env.example)", 
    "Current (process.env)",
    { compareValues: false } // Only check keys exist and types match
  );

  const critical = diff.entries.filter(e => e.severity === "error");
  
  if (critical.length > 0) {
    console.error(`❌ Missing ${critical.length} required variables:`);
    critical.forEach(e => console.error(`   - ${e.key}`));
    process.exit(1);
  }
  
  console.log("✅ Environment validation passed");
}

validateEnvironment();
```

## 📊 Example Output

```
┌─────────────────┬──────────────────┬──────────────────┬──────────────┬──────────┐
│ Key             │ .env.example     │ .env.production  │ Status       │ Severity │
├─────────────────┼──────────────────┼──────────────────┼──────────────┼──────────┤
│ DATABASE_URL    │ "postgres://..." │ undefined        │ removed      │ error    │
│ API_KEY         │ undefined        │ "sk-live-..."    │ added        │ info     │
│ PORT            │ 3000             │ "3000"           │ type-mismatch│ error    │
│ DEBUG           │ true             │ undefined        │ removed      │ warning  │
│ LOG_LEVEL       │ "debug"          │ "info"           │ modified     │ info     │
└─────────────────┴──────────────────┴──────────────────┴──────────────┴──────────┘
```

## 🚨 Status Codes & Severity

**DiffStatus** values:
- `added` — Key exists in target but not in source
- `removed` — Key exists in source but not in target  
- `modified` — Key exists in both with different values (same type)
- `unchanged` — Key exists in both with identical values
- `type-mismatch` — Key exists in both but with incompatible types (e.g., string vs number)

**Severity** levels:
- `error` — Deployment-blocking issues (missing required keys, type mismatches)
- `warning` — Changes requiring human review (value modifications, removed optional keys)
- `info` — Non-blocking informational differences (added keys in target)

## 🔄 CI Integration

Use `--strict` to fail builds when environment drift is detected.

**GitHub Actions example:**
```yaml
name: Environment Check
on: [push, pull_request]

jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Check environment parity
        run: |
          bunx @adametherzlab/env-diff \
            .env.example \
            .env.production \
            --strict \
            --ignore "NODE_ENV,CI"
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License

MIT (c) [AdametherzLab](https://github.com/AdametherzLab)
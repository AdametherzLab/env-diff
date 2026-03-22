[![CI](https://github.com/AdametherzLab/env-diff/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/env-diff/actions)
[![npm](https://img.shields.io/npm/v/@adametherzlab/env-diff)](https://www.npmjs.com/package/@adametherzlab/env-diff)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()

# env-diff

> Compare .env files across environments, branches, and runtimes. Catch missing variables, type mismatches, and configuration drift before deployment.

Built by [AdametherzLab](https://github.com/AdametherzLab) with [Claude](https://claude.ai).

## Why env-diff?

Environment variable mismatches are one of the most common causes of deployment failures. A missing `DATABASE_URL`, a `PORT` that changed from number to string, a secret that exists in development but not production — these bugs are silent until they break production.

**env-diff catches them all.**

## Features

- **Type-aware diffing** — Catches when `PORT=3000` (number) becomes `PORT="3000"` (string)
- **Git branch comparison** — `env-diff .env:main .env:staging` compares across branches
- **Secret masking** — Automatically detects and masks API keys, tokens, and passwords
- **Multi-file matrix** — Compare dev, staging, and prod simultaneously
- **Codebase scanning** — Auto-generate `.env.example` from your source code
- **Sync mode** — Generate patches to fix environment drift
- **Watch mode** — Live drift detection during development
- **CI/CD ready** — GitHub Action, strict mode, JSON output for automation
- **MCP server** — Native integration for AI coding agents (Claude Code, Cursor)
- **Zero dependencies** — Pure TypeScript, runs on Bun or Node.js 20+
- **Config file** — Persistent settings via `.envdiffrc.json`

## How env-diff compares

| Feature | env-diff | dotenv-linter | dotenv-diff | dotenvx |
|---------|:--------:|:-------------:|:-----------:|:-------:|
| Type-aware diffing | **yes** | no | no | no |
| Git branch comparison | **yes** | no | no | no |
| Secret masking | **yes** | no | no | yes |
| Multi-file matrix | **yes** | no | no | no |
| Codebase scanning | **yes** | no | no | no |
| MCP server (AI agents) | **yes** | no | no | no |
| GitHub Action | **yes** | no | no | no |
| Watch mode | **yes** | no | no | no |
| Sync mode | **yes** | no | no | no |
| Zero dependencies | **yes** | yes | no | no |
| Config file | **yes** | yes | no | yes |
| CI/CD strict mode | **yes** | yes | no | yes |

## Quick Start

### Installation

```bash
npm install -g @adametherzlab/env-diff
# or
bun add -g @adametherzlab/env-diff
# or use directly
npx @adametherzlab/env-diff .env.example .env.production
```

### Compare two files

```bash
env-diff .env.example .env.production
```

### Compare across git branches

```bash
env-diff .env:main .env:staging
env-diff .env@abc123 .env@HEAD
```

### Strict mode for CI

```bash
env-diff .env.example .env.production --strict
# Exits with code 1 if errors detected
```

## CLI Reference

```
env-diff <left> <right> [options]

Options:
  --strict           Exit with code 1 if errors detected
  --ignore <key>     Ignore specific keys (repeatable)
  --no-value-diff    Only check key existence and types
  --format <type>    Output: table (default), json, markdown, summary
  --mask             Mask detected secret values
  --watch            Re-diff on file changes
  --sync             Show patch to fix missing keys
  --sync-write       Apply sync patch to target file

Subcommands:
  --scan [dir]       Scan codebase for env var references
  --scan-write [dir] Generate .env.example from scan
  --matrix <files>   Compare multiple files simultaneously
  --install-hook     Install pre-commit git hook
```

## Output Formats

### Table (default)
```
+──────────────+──────────────+──────────────+───────────────+
│ Key          │ .env.example │ .env.prod    │ Status        │
+──────────────+──────────────+──────────────+───────────────+
│ DATABASE_URL │ postgres://… │ (undefined)  │ removed       │
│ PORT         │ 3000         │ "3000"       │ type-mismatch │
│ API_KEY      │ (undefined)  │ sk-l****     │ added         │
+──────────────+──────────────+──────────────+───────────────+

✖ Environment check failed with errors
```

### JSON
```bash
env-diff .env.example .env.prod --format json
```

### Markdown
```bash
env-diff .env.example .env.prod --format markdown
```

## Programmatic API

```typescript
import { parseEnvFile, diffEnvMaps, parseProcessEnv } from "@adametherzlab/env-diff";

// Compare .env files
const template = parseEnvFile(".env.example");
const runtime = parseProcessEnv();
const result = diffEnvMaps(template, runtime, "Template", "Runtime");

if (result.hasErrors) {
  console.error("Missing required environment variables!");
  result.entries
    .filter(e => e.severity === "error")
    .forEach(e => console.error(`  - ${e.key}: ${e.status}`));
  process.exit(1);
}
```

## Git Branch Comparison

Compare .env files across any git ref (branch, tag, commit):

```bash
# Compare main vs staging
env-diff .env:main .env:staging

# Compare current vs specific commit
env-diff .env@abc123 .env

# PR review: compare base branch vs HEAD
env-diff .env:origin/main .env:HEAD
```

## Secret Masking

env-diff automatically detects sensitive keys and masks their values:

```bash
env-diff .env.example .env.production --mask
# API_KEY: sk-l**** | SECRET_TOKEN: rea****
```

Default patterns: `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*CREDENTIAL*`, `*AUTH*`, `*PRIVATE*`

Configure custom patterns in `.envdiffrc.json`:
```json
{
  "secretPatterns": ["*KEY*", "*SECRET*", "STRIPE_*", "AWS_*"]
}
```

## Codebase Scanning

Auto-generate `.env.example` from your source code:

```bash
# Preview what variables your code uses
env-diff --scan ./src

# Generate .env.example
env-diff --scan-write ./src
```

Output:
```bash
# Referenced in: src/db.ts, src/config.ts
DATABASE_URL=

# Referenced in: src/server.ts
PORT=3000
```

## Multi-File Matrix

Compare all environments simultaneously:

```bash
env-diff --matrix .env.dev .env.staging .env.prod
```

## Sync Mode

Fix environment drift automatically:

```bash
# Preview missing keys
env-diff .env.example .env.local --sync

# Apply patch
env-diff .env.example .env.local --sync-write
```

## Configuration

Create `.envdiffrc.json` in your project root:

```json
{
  "ignoreKeys": ["NODE_ENV", "CI", "PATH"],
  "caseSensitive": true,
  "strict": true,
  "format": "table",
  "secretPatterns": ["*KEY*", "*SECRET*", "*TOKEN*"],
  "compareValues": true
}
```

Or add to `package.json`:
```json
{
  "envdiff": {
    "ignoreKeys": ["NODE_ENV"],
    "strict": true
  }
}
```

## CI/CD Integration

### GitHub Actions (Recommended)

```yaml
- uses: AdametherzLab/env-diff@v1
  with:
    left: '.env.example'
    right: '.env.production'
    strict: 'true'
    ignore: 'NODE_ENV,CI'
    mask-secrets: 'true'
```

### Generic CI

```yaml
steps:
  - run: npx @adametherzlab/env-diff .env.example .env.production --strict --mask
```

### Pre-commit Hook

```bash
env-diff --install-hook
```

## AI Agent Integration (MCP)

env-diff includes an MCP (Model Context Protocol) server for AI coding agents:

```bash
# Add to Claude Code, Cursor, or any MCP-compatible agent
env-diff-mcp
```

Available tools:
- `env_diff_compare` — Compare .env files or content
- `env_diff_scan` — Scan codebase for env references
- `env_diff_sync` — Generate sync patches

## Watch Mode

Live drift detection during development:

```bash
env-diff .env.example .env --watch
# Re-diffs automatically when either file changes
```

## API Reference

| Function | Description |
|----------|-------------|
| `parseEnvString(content, options?)` | Parse raw .env content into typed EnvMap |
| `parseEnvFile(filePath, options?)` | Read and parse .env file |
| `parseProcessEnv()` | Wrap `process.env` into typed EnvMap |
| `diffEnvMaps(left, right, leftLabel, rightLabel, options?)` | Compare two EnvMaps |
| `loadGitEnv(source, options?)` | Load .env from git ref |
| `scanForEnvVars(directory, extensions?)` | Scan code for env references |
| `syncEnvFiles(source, target, options?)` | Generate sync patch |
| `compareMatrix(filePaths, options?)` | Multi-file comparison |
| `watchEnvFiles(left, right, options?)` | Live file watching |
| `isSecretKey(key, patterns?)` | Check if key is a secret |
| `maskValue(value)` | Mask a sensitive value |
| `formatTable(result)` | Format as colored table |
| `formatJson(result)` | Format as JSON |
| `formatMarkdown(result)` | Format as markdown table |

## Status & Severity

| Status | Severity | Meaning |
|--------|----------|---------|
| `removed` | error | Key missing in target |
| `type-mismatch` | error | Same key, different types |
| `added` | warning | New key in target only |
| `modified` | warning | Same key & type, different value |
| `unchanged` | info | Identical |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT (c) [AdametherzLab](https://github.com/AdametherzLab) — Built with [Claude](https://claude.ai)

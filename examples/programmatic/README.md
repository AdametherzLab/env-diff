# Programmatic API Example

Use env-diff as a library in your TypeScript/JavaScript code.

## Pre-deployment Validation

`validate.ts` shows how to check that all required environment variables
are present before your application starts.

```bash
bun run validate.ts
```

## Key Functions

- `parseEnvFile(path)` — Parse a .env file into a typed map
- `parseProcessEnv()` — Wrap `process.env` into a typed map
- `diffEnvMaps(left, right, leftLabel, rightLabel, options)` — Compare two maps
- `scanForEnvVars(directory)` — Find env var references in source code

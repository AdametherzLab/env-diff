# env-diff GitHub Action

Compare .env files in your CI/CD pipeline to catch environment drift before deployment.

## Usage

```yaml
- uses: AdametherzLab/env-diff@v1
  with:
    left: '.env.example'
    right: '.env.production'
    strict: 'true'
    ignore: 'NODE_ENV,CI'
```

## Full Example

```yaml
name: Check Environment
on: [pull_request]

jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Compare env files
        id: env-diff
        uses: AdametherzLab/env-diff@v1
        with:
          left: '.env.example'
          right: '.env.production'
          strict: 'true'
          ignore: 'NODE_ENV,CI'
          format: 'table'
          mask-secrets: 'true'

      - name: Use outputs
        if: always()
        run: |
          echo "Has errors: ${{ steps.env-diff.outputs.has-errors }}"
          echo "Has warnings: ${{ steps.env-diff.outputs.has-warnings }}"
          echo "Added keys: ${{ steps.env-diff.outputs.added-count }}"
          echo "Removed keys: ${{ steps.env-diff.outputs.removed-count }}"
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `left` | Source .env file | (required) |
| `right` | Target .env file | (required) |
| `strict` | Fail on errors | `true` |
| `ignore` | Keys to ignore (comma-separated) | `''` |
| `format` | Output: table, json, markdown, summary | `table` |
| `mask-secrets` | Mask secret values | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `has-errors` | Whether errors were detected |
| `has-warnings` | Whether warnings were detected |
| `added-count` | Number of added keys |
| `removed-count` | Number of removed keys |
| `json-result` | Full result as JSON |

## How It Works

The action parses both .env files, compares every key, and classifies differences:

- **removed** (error) -- key in left but missing from right
- **type-mismatch** (error) -- key in both but types differ (e.g., string vs number)
- **added** (warning) -- key in right but missing from left
- **modified** (warning) -- same key, different value
- **unchanged** (info) -- identical in both

When `strict: 'true'` (default), the action fails if any errors are detected. A markdown summary is always written to the GitHub Step Summary regardless of the chosen output format.

Secret values (keys matching patterns like `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*`) are automatically masked in output when `mask-secrets: 'true'`.

Built by [AdametherzLab](https://github.com/AdametherzLab) with Claude.

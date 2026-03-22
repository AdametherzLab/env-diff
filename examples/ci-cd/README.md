# CI/CD Integration Example

Use env-diff in your GitHub Actions workflow to catch environment drift on every PR.

See `workflow.yml` for a complete example.

## Key Features
- Runs on every push to main and PRs that touch `.env*` files
- Strict mode fails the build if required variables are missing
- Secret values are automatically masked in CI output
- Ignores expected differences (`NODE_ENV`, `CI`)

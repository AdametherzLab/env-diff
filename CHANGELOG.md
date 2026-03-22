# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-22

### Added
- Full .env parser with type coercion (numbers, booleans, strings, empty)
- Multiline double-quoted value support (PEM keys, certificates)
- Variable expansion (`${VAR}`, `$VAR`) with single-pass replacement
- Git branch comparison (`env-diff .env:main .env:staging`)
- Secret detection and masking (`--mask` flag) with configurable patterns
- Multi-file matrix comparison (`--matrix`)
- Codebase scanner for env var references (`--scan`, `--scan-write`)
- Watch mode for live drift detection (`--watch`)
- Sync mode to fix missing variables (`--sync`, `--sync-write`)
- Config file support (`.envdiffrc.json` or `package.json` `"envdiff"` key)
- MCP server for AI agent integration (`env-diff-mcp`)
- GitHub Action for CI/CD pipelines
- Pre-commit hook installer (`--install-hook`)
- JSON, Markdown, Summary output formats (`--format`)
- 166 tests with comprehensive edge case coverage

### Fixed
- Command injection vulnerability in git ref handling (switched to `execFileSync`)
- Variable expansion double-replacement bug (single-pass regex)
- Secret leakage in GitHub Action `json-result` output
- Markdown formatter pipe character escaping
- `isGitSource` false positives on absolute paths
- Watcher silently swallowing non-filesystem errors

## [0.1.0] - 2026-03-22

### Added
- Initial release with type system (`ValueType` discriminated union)
- Bidirectional diff engine with severity classification
- CLI with ANSI-colored table output
- MIT license

[0.2.0]: https://github.com/AdametherzLab/env-diff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AdametherzLab/env-diff/releases/tag/v0.1.0

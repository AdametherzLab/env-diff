# MCP Server Integration

env-diff includes an MCP (Model Context Protocol) server for AI coding agents.

## Setup for Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "env-diff": {
      "command": "npx",
      "args": ["@adametherzlab/env-diff-mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `env_diff_compare` | Compare two .env files or raw content |
| `env_diff_scan` | Scan codebase for env var references |
| `env_diff_sync` | Generate patch for missing variables |

## Example Usage

Once configured, you can ask your AI agent:

- "Compare .env.example against .env.production"
- "Scan src/ for environment variables and check if they're all in .env.example"
- "What variables are missing from .env.local compared to .env.example?"

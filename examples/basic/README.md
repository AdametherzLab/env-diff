# Basic env-diff Example

Compare `.env.example` against `.env.production` to find drift:

```bash
# Table output (default)
env-diff .env.example .env.production

# With secret masking
env-diff .env.example .env.production --mask

# JSON output for automation
env-diff .env.example .env.production --format json

# Strict mode (exits with code 1 on errors)
env-diff .env.example .env.production --strict
```

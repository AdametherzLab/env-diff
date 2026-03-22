import * as fs from "fs";
import * as path from "path";

const HOOK_CONTENT = `#!/bin/sh
# env-diff pre-commit hook - installed by env-diff
# Checks .env.example against .env for drift

if [ -f ".env.example" ] && [ -f ".env" ]; then
  npx @adametherzlab/env-diff .env.example .env --strict --mask
  if [ $? -ne 0 ]; then
    echo "env-diff: Environment drift detected. Fix issues above before committing."
    exit 1
  fi
fi
`;

export function installPreCommitHook(cwd?: string): { success: boolean; message: string } {
  const root = cwd ?? process.cwd();
  const gitDir = path.join(root, ".git");

  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    return { success: false, message: "Not a git repository (no .git directory found)." };
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, "pre-commit");

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (existing.includes("env-diff")) {
      return { success: true, message: "Pre-commit hook already contains env-diff. Skipped." };
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, "\n" + HOOK_CONTENT);
    fs.chmodSync(hookPath, 0o755);
    return { success: true, message: "Appended env-diff check to existing pre-commit hook." };
  }

  fs.writeFileSync(hookPath, HOOK_CONTENT, { mode: 0o755 });
  return { success: true, message: "Installed env-diff pre-commit hook." };
}

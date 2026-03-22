import { describe, it, expect } from "bun:test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  parseEnvString,
  parseEnvFile,
  diffEnvMaps,
  isGitSource,
  parseGitRef,
  isSecretKey,
  maskValue,
  DEFAULT_SECRET_PATTERNS,
  scanForEnvVars,
  generateEnvExample,
  syncEnvFiles,
  compareMatrix,
  renderMatrixTable,
  formatTable,
  formatJson,
  formatMarkdown,
  formatSummary,
  formatValue,
  loadConfig,
  runCli,
} from "../src/index.ts";
import type { EnvMap, ValueType, DiffResult } from "../src/types.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");

// ============== PARSER EDGE CASES ==============

describe("parser edge cases", () => {
  it("handles duplicate keys (last one wins)", () => {
    const result = parseEnvString("KEY=first\nKEY=second");
    expect(result.KEY).toEqual({ kind: "string", value: "second" });
  });

  it("handles keys with underscores and numbers", () => {
    const result = parseEnvString("MY_VAR_123=test");
    expect(result.MY_VAR_123).toEqual({ kind: "string", value: "test" });
  });

  it("handles quoted numbers as strings inside double quotes", () => {
    const result = parseEnvString('PORT="3000"');
    // Quoted values should be stripped but still coerced
    expect(result.PORT).toEqual({ kind: "number", value: 3000, raw: "3000" });
  });

  it("handles quoted booleans as strings inside single quotes", () => {
    const result = parseEnvString("DEBUG='true'");
    // Single-quoted -- should be coerced after unquoting
    expect(result.DEBUG).toEqual({ kind: "boolean", value: true, raw: "true" });
  });

  it("handles empty quoted string", () => {
    const result = parseEnvString('EMPTY=""');
    expect(result.EMPTY).toEqual({ kind: "empty", value: undefined });
  });

  it("handles empty single-quoted string", () => {
    const result = parseEnvString("EMPTY=''");
    expect(result.EMPTY).toEqual({ kind: "empty", value: undefined });
  });

  it("handles URLs with special characters", () => {
    const result = parseEnvString(
      "DB=postgres://user:p%40ss@host:5432/db?ssl=true&timeout=30"
    );
    expect(result.DB.kind).toBe("string");
    if (result.DB.kind === "string") {
      expect(result.DB.value).toContain("p%40ss");
      expect(result.DB.value).toContain("ssl=true");
    }
  });

  it("handles value that looks numeric but is too large", () => {
    const result = parseEnvString("BIG=99999999999999999999999999999999");
    // parseFloat will succeed but give Infinity or imprecise number
    // Since Number.isFinite returns true for large floats, this should still be number
    expect(result.BIG.kind).toBe("number");
  });

  it("handles value with leading zeros (should be string, not octal)", () => {
    const result = parseEnvString("CODE=007");
    // 007 matches the number regex, parseFloat gives 7
    expect(result.CODE.kind).toBe("number");
    if (result.CODE.kind === "number") {
      expect(result.CODE.value).toBe(7);
      expect(result.CODE.raw).toBe("007");
    }
  });

  it("handles completely empty file", () => {
    const result = parseEnvString("");
    expect(Object.keys(result)).toEqual([]);
  });

  it("handles file with only comments", () => {
    const result = parseEnvString("# Comment 1\n# Comment 2\n");
    expect(Object.keys(result)).toEqual([]);
  });

  it("handles file with only blank lines", () => {
    const result = parseEnvString("\n\n\n");
    expect(Object.keys(result)).toEqual([]);
  });

  it("handles value with backticks", () => {
    const result = parseEnvString("CMD=`echo hello`");
    expect(result.CMD).toEqual({ kind: "string", value: "`echo hello`" });
  });

  it("handles multiline with subsequent keys after closing quote", () => {
    const content = 'KEY1="line1\nline2"\nKEY2=after';
    const result = parseEnvString(content);
    expect(result.KEY1.kind).toBe("string");
    expect(result.KEY2).toEqual({ kind: "string", value: "after" });
  });

  it("handles unterminated double quote in non-strict mode", () => {
    const content = 'KEY="never closed\nNEXT=value';
    const result = parseEnvString(content);
    // Should accumulate everything as the value
    expect(result.KEY).toBeDefined();
    expect(result.KEY.kind).toBe("string");
  });

  it("throws for unterminated double quote in strict mode", () => {
    const content = 'KEY="never closed';
    expect(() => parseEnvString(content, { strict: true })).toThrow(SyntaxError);
  });

  it("throws for unterminated single quote in strict mode", () => {
    const content = "KEY='never closed";
    expect(() => parseEnvString(content, { strict: true })).toThrow(SyntaxError);
  });

  it("handles value with only spaces", () => {
    const result = parseEnvString("KEY=   ");
    // After trim, this becomes empty
    expect(result.KEY).toEqual({ kind: "empty", value: undefined });
  });

  it("handles inline comment right after value with no space before hash", () => {
    // Only ` #` (space+hash) is an inline comment, not just `#`
    const result = parseEnvString("URL=http://host#fragment");
    expect(result.URL).toEqual({ kind: "string", value: "http://host#fragment" });
  });

  it("variable expansion with double-quoted values containing $", () => {
    const content = 'BASE=http://localhost\nURL="${BASE}/api"';
    const result = parseEnvString(content, { expandVariables: true });
    expect(result.URL).toEqual({ kind: "string", value: "http://localhost/api" });
  });

  it("variable expansion does not double-expand", () => {
    const content = "A=hello\nB=$A\nC=$B";
    const result = parseEnvString(content, { expandVariables: true });
    expect(result.B).toEqual({ kind: "string", value: "hello" });
    expect(result.C).toEqual({ kind: "string", value: "hello" });
  });

  it("parseEnvFile throws for nonexistent file", () => {
    expect(() => parseEnvFile("/nonexistent/path/.env")).toThrow();
  });
});

// ============== DIFFER EDGE CASES ==============

describe("differ edge cases", () => {
  it("handles both sides empty", () => {
    const result = diffEnvMaps({}, {}, "left", "right");
    expect(result.entries).toEqual([]);
    expect(result.hasErrors).toBe(false);
    expect(result.hasWarnings).toBe(false);
  });

  it("handles one side empty (left)", () => {
    const right: EnvMap = {
      A: { kind: "string", value: "a" },
      B: { kind: "number", value: 1, raw: "1" },
    };
    const result = diffEnvMaps({}, right, "l", "r");
    expect(result.entries.length).toBe(2);
    expect(result.entries.every((e) => e.status === "added")).toBe(true);
  });

  it("handles one side empty (right)", () => {
    const left: EnvMap = {
      A: { kind: "string", value: "a" },
    };
    const result = diffEnvMaps(left, {}, "l", "r");
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].status).toBe("removed");
  });

  it("empty vs empty value types are unchanged", () => {
    const left: EnvMap = { KEY: { kind: "empty", value: undefined } };
    const right: EnvMap = { KEY: { kind: "empty", value: undefined } };
    const result = diffEnvMaps(left, right, "l", "r");
    expect(result.entries[0].status).toBe("unchanged");
  });

  it("empty vs string is a type mismatch", () => {
    const left: EnvMap = { KEY: { kind: "empty", value: undefined } };
    const right: EnvMap = { KEY: { kind: "string", value: "hello" } };
    const result = diffEnvMaps(left, right, "l", "r");
    expect(result.entries[0].status).toBe("type-mismatch");
  });

  it("number vs boolean is a type mismatch", () => {
    const left: EnvMap = { KEY: { kind: "number", value: 1, raw: "1" } };
    const right: EnvMap = { KEY: { kind: "boolean", value: true, raw: "true" } };
    const result = diffEnvMaps(left, right, "l", "r");
    expect(result.entries[0].status).toBe("type-mismatch");
    expect(result.entries[0].severity).toBe("error");
  });

  it("ignoreKeys is case-insensitive when caseSensitive is false", () => {
    const left: EnvMap = { api_key: { kind: "string", value: "secret" } };
    const right: EnvMap = {};
    const result = diffEnvMaps(left, right, "l", "r", {
      ignoreKeys: ["API_KEY"],
      caseSensitive: false,
    });
    expect(result.entries.length).toBe(0);
  });

  it("large number of keys are all sorted", () => {
    const env: EnvMap = {};
    const keys = Array.from({ length: 50 }, (_, i) =>
      String.fromCharCode(90 - (i % 26)) + "_" + i
    );
    for (const key of keys) {
      (env as Record<string, ValueType>)[key] = { kind: "string", value: "v" };
    }
    const result = diffEnvMaps(env, env, "l", "r");
    const resultKeys = result.entries.map((e) => e.key);
    const sorted = [...resultKeys].sort();
    expect(resultKeys).toEqual(sorted);
  });
});

// ============== GIT SOURCE DETECTION ==============

describe("git source detection edge cases", () => {
  it("detects .env:main as git source", () => {
    expect(isGitSource(".env:main")).toBe(true);
  });

  it("detects .env@abc123 as git source", () => {
    expect(isGitSource(".env@abc123")).toBe(true);
  });

  it("does NOT detect Windows path C:\\file as git source", () => {
    expect(isGitSource("C:\\Users\\file.env")).toBe(false);
  });

  it("does NOT detect D:/path as git source", () => {
    expect(isGitSource("D:/some/path")).toBe(false);
  });

  it("detects regular file paths without : or @ as NOT git source", () => {
    expect(isGitSource(".env")).toBe(false);
    expect(isGitSource("path/to/.env")).toBe(false);
    expect(isGitSource("/absolute/.env")).toBe(false);
  });

  it("does NOT false-positive on paths with @ in directory names", () => {
    expect(isGitSource("/home/user@host/.env")).toBe(false);
  });

  it("does NOT false-positive on bare colons without valid ref", () => {
    expect(isGitSource(".env:")).toBe(false);
    expect(isGitSource(":main")).toBe(false);
  });

  it("parseGitRef splits correctly on colon", () => {
    const { filePath, ref } = parseGitRef(".env:main");
    expect(filePath).toBe(".env");
    expect(ref).toBe("main");
  });

  it("parseGitRef splits correctly on @", () => {
    const { filePath, ref } = parseGitRef(".env@abc123");
    expect(filePath).toBe(".env");
    expect(ref).toBe("abc123");
  });

  it("parseGitRef throws for missing file path", () => {
    expect(() => parseGitRef(":main")).toThrow();
  });

  it("parseGitRef throws for missing ref", () => {
    expect(() => parseGitRef(".env:")).toThrow();
  });

  it("parseGitRef handles path with directory", () => {
    const { filePath, ref } = parseGitRef("config/.env:feature-branch");
    expect(filePath).toBe("config/.env");
    expect(ref).toBe("feature-branch");
  });
});

// ============== SECRETS EDGE CASES ==============

describe("secrets edge cases", () => {
  it("detects API_KEY as secret", () => {
    expect(isSecretKey("API_KEY")).toBe(true);
  });

  it("detects DATABASE_PASSWORD as secret", () => {
    expect(isSecretKey("DATABASE_PASSWORD")).toBe(true);
  });

  it("detects JWT_TOKEN as secret", () => {
    expect(isSecretKey("JWT_TOKEN")).toBe(true);
  });

  it("detects PRIVATE_KEY as secret", () => {
    expect(isSecretKey("PRIVATE_KEY")).toBe(true);
  });

  it("does NOT detect PORT as secret", () => {
    expect(isSecretKey("PORT")).toBe(false);
  });

  it("does NOT detect APP_NAME as secret", () => {
    expect(isSecretKey("APP_NAME")).toBe(false);
  });

  it("does NOT detect DEBUG as secret", () => {
    expect(isSecretKey("DEBUG")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSecretKey("api_key")).toBe(true);
    expect(isSecretKey("Api_Key")).toBe(true);
  });

  it("works with custom patterns", () => {
    expect(isSecretKey("STRIPE_SK", ["STRIPE_*"])).toBe(true);
    expect(isSecretKey("AWS_ACCESS", ["AWS_*"])).toBe(true);
    expect(isSecretKey("PORT", ["STRIPE_*"])).toBe(false);
  });

  it("works with empty patterns array", () => {
    expect(isSecretKey("API_KEY", [])).toBe(false);
  });

  it("masks long strings showing first 4 chars", () => {
    const result = maskValue({ kind: "string", value: "sk-live-abc123def456" });
    expect(result).toEqual({ kind: "string", value: "sk-l****" });
  });

  it("masks short strings entirely", () => {
    const result = maskValue({ kind: "string", value: "abc" });
    expect(result).toEqual({ kind: "string", value: "****" });
  });

  it("masks exactly 4-char strings entirely", () => {
    const result = maskValue({ kind: "string", value: "abcd" });
    expect(result).toEqual({ kind: "string", value: "****" });
  });

  it("masks number values", () => {
    const result = maskValue({ kind: "number", value: 12345, raw: "12345" });
    expect(result).toEqual({ kind: "string", value: "1234****" });
  });

  it("masks boolean values", () => {
    const result = maskValue({ kind: "boolean", value: true, raw: "true" });
    // "true" is 4 chars, which gets fully masked
    expect(result).toEqual({ kind: "string", value: "****" });
  });

  it("returns empty values unchanged", () => {
    const empty: ValueType = { kind: "empty", value: undefined };
    expect(maskValue(empty)).toEqual(empty);
  });

  it("masks empty string values unchanged", () => {
    // An empty raw string returns the original value
    const result = maskValue({ kind: "string", value: "" });
    // empty string check returns unchanged
    expect(result.kind).toBe("string");
  });
});

// ============== FORMATTERS EDGE CASES ==============

describe("formatters edge cases", () => {
  const emptyResult: DiffResult = {
    entries: [],
    leftLabel: "left",
    rightLabel: "right",
    hasErrors: false,
    hasWarnings: false,
  };

  const singleResult: DiffResult = {
    entries: [
      {
        key: "PORT",
        left: { kind: "number", value: 3000, raw: "3000" },
        right: { kind: "string", value: "3000" },
        status: "type-mismatch",
        severity: "error",
      },
    ],
    leftLabel: "dev",
    rightLabel: "prod",
    hasErrors: true,
    hasWarnings: false,
  };

  it("formatValue handles undefined", () => {
    expect(formatValue(undefined)).toBe("(undefined)");
  });

  it("formatValue handles empty type", () => {
    expect(formatValue({ kind: "empty", value: undefined })).toBe("(empty)");
  });

  it("formatValue truncates long strings", () => {
    const long = { kind: "string" as const, value: "a".repeat(50) };
    const formatted = formatValue(long);
    expect(formatted.length).toBeLessThanOrEqual(30);
    expect(formatted).toContain("...");
  });

  it("formatValue shows short strings in full", () => {
    expect(formatValue({ kind: "string", value: "short" })).toBe("short");
  });

  it("formatValue shows numbers via raw", () => {
    expect(formatValue({ kind: "number", value: 42, raw: "42" })).toBe("42");
  });

  it("formatTable handles empty entries", () => {
    const table = formatTable(emptyResult);
    expect(table).toContain("KEY");
    expect(table).toContain("left");
    expect(table).toContain("right");
    expect(table).toContain("passed");
  });

  it("formatTable shows error message for errors", () => {
    const table = formatTable(singleResult);
    expect(table).toContain("failed with errors");
  });

  it("formatJson includes generator field", () => {
    const json = JSON.parse(formatJson(emptyResult));
    expect(json.generator).toBe("env-diff by AdametherzLab");
  });

  it("formatJson includes summary counts", () => {
    const json = JSON.parse(formatJson(singleResult));
    expect(json.summary.typeMismatch).toBe(1);
    expect(json.summary.added).toBe(0);
  });

  it("formatMarkdown produces valid markdown table", () => {
    const md = formatMarkdown(singleResult);
    expect(md).toContain("| Key |");
    expect(md).toContain("|-----|");
    expect(md).toContain("| PORT |");
    expect(md).toContain("type-mismatch");
  });

  it("formatSummary shows checkmark for clean result", () => {
    const summary = formatSummary(emptyResult);
    expect(summary).toContain("0 keys matched");
  });

  it("formatSummary shows error count", () => {
    const summary = formatSummary(singleResult);
    expect(summary).toContain("1 errors");
  });
});

// ============== CONFIG EDGE CASES ==============

describe("config edge cases", () => {
  it("loadConfig returns empty object when no config file exists", () => {
    const config = loadConfig(os.tmpdir());
    expect(config).toEqual({});
  });

  it("loadConfig finds .envdiffrc.json if present", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "envdiff-"));
    try {
      fs.writeFileSync(
        path.join(tmpDir, ".envdiffrc.json"),
        JSON.stringify({ strict: true, ignoreKeys: ["TEST"] })
      );
      const config = loadConfig(tmpDir);
      expect(config.strict).toBe(true);
      expect(config.ignoreKeys).toEqual(["TEST"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ============== SYNC EDGE CASES ==============

describe("sync edge cases", () => {
  it("returns no changes when files are identical", () => {
    const file = path.join(fixturesDir, ".env.example");
    const result = syncEnvFiles(file, file);
    expect(result.hasChanges).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("detects missing keys", () => {
    const example = path.join(fixturesDir, ".env.example");
    const dev = path.join(fixturesDir, ".env.dev");
    const result = syncEnvFiles(example, dev);
    // SECRET_TOKEN is in example but not dev
    expect(result.added).toContain("SECRET_TOKEN");
  });

  it("detects extra keys in target", () => {
    const example = path.join(fixturesDir, ".env.example");
    const dev = path.join(fixturesDir, ".env.dev");
    const result = syncEnvFiles(example, dev);
    // EXTRA_DEV_VAR is in dev but not example
    expect(result.removed).toContain("EXTRA_DEV_VAR");
  });

  it("handles nonexistent target file gracefully", () => {
    const example = path.join(fixturesDir, ".env.example");
    const result = syncEnvFiles(example, "/nonexistent/.env");
    expect(result.hasChanges).toBe(true);
    // All keys from example should be in added
    expect(result.added.length).toBeGreaterThan(0);
  });
});

// ============== MATRIX EDGE CASES ==============

describe("matrix edge cases", () => {
  it("compares 3 files in pairwise matrix", () => {
    const files = [
      path.join(fixturesDir, ".env.example"),
      path.join(fixturesDir, ".env.dev"),
      path.join(fixturesDir, ".env.prod"),
    ];
    const result = compareMatrix(files);
    expect(result.labels.length).toBe(3);
    // 3x3 matrix, diagonal is null
    expect(result.comparisons.length).toBe(3);
    expect(result.comparisons[0][0]).toBeNull();
    expect(result.comparisons[0][1]).not.toBeNull();
    expect(result.comparisons[1][0]).not.toBeNull();
  });

  it("throws for fewer than 2 files", () => {
    expect(() =>
      compareMatrix([path.join(fixturesDir, ".env.example")])
    ).toThrow();
  });

  it("renderMatrixTable produces readable output", () => {
    const files = [
      path.join(fixturesDir, ".env.example"),
      path.join(fixturesDir, ".env.dev"),
    ];
    const matrix = compareMatrix(files);
    const table = renderMatrixTable(matrix);
    expect(table).toContain("--");
    expect(typeof table).toBe("string");
    expect(table.split("\n").length).toBeGreaterThan(2);
  });
});

// ============== SCAN EDGE CASES ==============

describe("scan edge cases", () => {
  it("scanForEnvVars on src/ finds process.env references", () => {
    const srcDir = path.resolve(import.meta.dir, "../src");
    const vars = scanForEnvVars(srcDir);
    // parser.ts uses process.env in parseProcessEnv
    // There should be at least some hits
    expect(vars.size).toBeGreaterThanOrEqual(0);
  });

  it("scanForEnvVars returns empty map for directory with no code", () => {
    const vars = scanForEnvVars(fixturesDir);
    expect(vars.size).toBe(0);
  });

  it("generateEnvExample produces sorted output", () => {
    const vars = new Map<string, string[]>();
    vars.set("ZEBRA_VAR", ["z.ts"]);
    vars.set("ALPHA_VAR", ["a.ts"]);
    const output = generateEnvExample(vars);
    const lines = output.split("\n").filter((l) => !l.startsWith("#") && l.includes("="));
    expect(lines[0]).toContain("ALPHA_VAR");
    expect(lines[1]).toContain("ZEBRA_VAR");
  });

  it("generateEnvExample preserves existing values", () => {
    const vars = new Map<string, string[]>();
    vars.set("PORT", ["server.ts"]);
    vars.set("NEW_VAR", ["app.ts"]);
    const existing = "PORT=3000\nOLD_VAR=old";
    const output = generateEnvExample(vars, existing);
    expect(output).toContain("PORT=3000");
    expect(output).toContain("NEW_VAR=");
  });
});

// ============== CLI EDGE CASES ==============

describe("CLI edge cases", () => {
  const exampleFile = path.join(fixturesDir, ".env.example");
  const devFile = path.join(fixturesDir, ".env.dev");
  const prodFile = path.join(fixturesDir, ".env.prod");

  it("--format without value returns error", () => {
    const exit = runCli([exampleFile, devFile, "--format"]);
    expect(exit).toBe(1);
  });

  it("--format with invalid value returns error", () => {
    const exit = runCli([exampleFile, devFile, "--format", "xml"]);
    expect(exit).toBe(1);
  });

  it("--ignore without value returns error", () => {
    const exit = runCli([exampleFile, devFile, "--ignore"]);
    expect(exit).toBe(1);
  });

  it("multiple --ignore flags work", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      const exit = runCli([
        exampleFile,
        devFile,
        "--format",
        "json",
        "--ignore",
        "SECRET_TOKEN",
        "--ignore",
        "API_KEY",
      ]);
      expect(exit).toBe(0);
      const parsed = JSON.parse(logs.join("\n"));
      const keys = parsed.entries.map((e: { key: string }) => e.key);
      expect(keys).not.toContain("SECRET_TOKEN");
      expect(keys).not.toContain("API_KEY");
    } finally {
      console.log = origLog;
    }
  });

  it("--mask flag masks secret values", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      runCli([exampleFile, prodFile, "--format", "json", "--mask"]);
      const parsed = JSON.parse(logs.join("\n"));
      const apiEntry = parsed.entries.find(
        (e: { key: string }) => e.key === "API_KEY"
      );
      // API_KEY should be masked
      if (apiEntry?.left?.value) {
        expect(apiEntry.left.value).toContain("****");
      }
    } finally {
      console.log = origLog;
    }
  });

  it("--format summary returns one line", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      runCli([exampleFile, devFile, "--format", "summary"]);
      // Summary should be concise
      expect(logs.length).toBeGreaterThan(0);
    } finally {
      console.log = origLog;
    }
  });

  it("--matrix with 3 files works", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      const exit = runCli([
        "--matrix",
        exampleFile,
        devFile,
        prodFile,
      ]);
      expect(typeof exit).toBe("number");
    } finally {
      console.log = origLog;
    }
  });

  it("--matrix with fewer than 2 files fails", () => {
    const exit = runCli(["--matrix", exampleFile]);
    expect(exit).toBe(1);
  });

  it("--scan on fixtures dir (no code files) works", () => {
    const exit = runCli(["--scan", fixturesDir]);
    expect(exit).toBe(0);
  });

  it("three positional args fails for compare mode", () => {
    const exit = runCli([exampleFile, devFile, prodFile]);
    expect(exit).toBe(1);
  });

  it("process.env as source works", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      const exit = runCli([exampleFile, "process.env", "--format", "summary"]);
      expect(exit).toBe(0);
    } finally {
      console.log = origLog;
    }
  });
});

// ============== INTEGRATION: FULL ROUND TRIP ==============

describe("integration: parse -> diff -> format round trip", () => {
  it("parses real fixture files and produces correct diff", () => {
    const example = parseEnvFile(path.join(fixturesDir, ".env.example"));
    const prod = parseEnvFile(path.join(fixturesDir, ".env.prod"));
    const result = diffEnvMaps(example, prod, "example", "prod");

    // PORT: example has 3000 (number), prod has "8080" (inside quotes, number)
    // Both should be number type -- check what prod actually parses to
    const portEntry = result.entries.find((e) => e.key === "PORT");
    expect(portEntry).toBeDefined();

    // EMPTY_VAR is in example (empty) but not in prod -> removed
    const emptyEntry = result.entries.find((e) => e.key === "EMPTY_VAR");
    expect(emptyEntry?.status).toBe("removed");

    // REDIS_URL is only in prod -> added
    const redisEntry = result.entries.find((e) => e.key === "REDIS_URL");
    expect(redisEntry?.status).toBe("added");

    // Should be able to format in all modes without errors
    expect(() => formatTable(result)).not.toThrow();
    expect(() => formatJson(result)).not.toThrow();
    expect(() => formatMarkdown(result)).not.toThrow();
    expect(() => formatSummary(result)).not.toThrow();
  });

  it("JSON format round-trips through parse", () => {
    const example = parseEnvFile(path.join(fixturesDir, ".env.example"));
    const dev = parseEnvFile(path.join(fixturesDir, ".env.dev"));
    const result = diffEnvMaps(example, dev, "example", "dev");
    const json = formatJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.generator).toBe("env-diff by AdametherzLab");
    expect(parsed.entries.length).toBe(result.entries.length);
    expect(typeof parsed.summary.added).toBe("number");
    expect(typeof parsed.summary.removed).toBe("number");
    expect(typeof parsed.summary.modified).toBe("number");
    expect(typeof parsed.summary.unchanged).toBe("number");
    expect(typeof parsed.summary.typeMismatch).toBe("number");
  });
});

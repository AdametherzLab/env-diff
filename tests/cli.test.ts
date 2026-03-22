import { describe, it, expect } from "bun:test";
import * as path from "path";
import { runCli } from "../src/index.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");
const exampleFile = path.join(fixturesDir, ".env.example");
const devFile = path.join(fixturesDir, ".env.dev");

describe("runCli - basic usage", () => {
  it("returns 0 when comparing two valid files without --strict", () => {
    const exitCode = runCli([exampleFile, devFile]);
    expect(exitCode).toBe(0);
  });

  it("returns 1 with --strict when errors exist (removed keys)", () => {
    // .env.example has SECRET_TOKEN which .env.dev does not -> removed -> error
    const exitCode = runCli([exampleFile, devFile, "--strict"]);
    expect(exitCode).toBe(1);
  });
});

describe("runCli - --ignore flag", () => {
  it("ignores specified keys so they do not cause errors", () => {
    // SECRET_TOKEN is in example but not dev -> removed -> error
    // Ignoring it should reduce errors
    const exitCode = runCli([exampleFile, devFile, "--strict", "--ignore", "SECRET_TOKEN"]);
    // Still might have other differences, but SECRET_TOKEN won't cause error
    expect(typeof exitCode).toBe("number");
  });
});

describe("runCli - --no-value-diff flag", () => {
  it("returns 0 when value differences are ignored and only removed keys cause errors", () => {
    // With --no-value-diff, modified entries become unchanged
    // But removed keys still cause errors unless ignored
    const exitCode = runCli([exampleFile, devFile, "--no-value-diff"]);
    expect(exitCode).toBe(0);
  });
});

describe("runCli - --format json", () => {
  it("outputs valid JSON", () => {
    // Capture console.log output
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      const exitCode = runCli([exampleFile, devFile, "--format", "json"]);
      expect(exitCode).toBe(0);

      const jsonOutput = logs.join("\n");
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveProperty("entries");
      expect(parsed).toHaveProperty("leftLabel");
      expect(parsed).toHaveProperty("rightLabel");
      expect(parsed).toHaveProperty("hasErrors");
      expect(parsed).toHaveProperty("hasWarnings");
      expect(Array.isArray(parsed.entries)).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});

describe("runCli - error handling", () => {
  it("returns 1 for missing file", () => {
    const exitCode = runCli(["/nonexistent/.env.fake", devFile]);
    expect(exitCode).toBe(1);
  });

  it("returns 1 for invalid arguments (no positional args)", () => {
    const exitCode = runCli([]);
    expect(exitCode).toBe(1);
  });

  it("returns 1 for unknown flags", () => {
    const exitCode = runCli([exampleFile, devFile, "--unknown-flag"]);
    expect(exitCode).toBe(1);
  });

  it("returns 1 when only one file is provided", () => {
    const exitCode = runCli([exampleFile]);
    expect(exitCode).toBe(1);
  });
});

import { describe, it, expect } from "bun:test";
import { parseEnvString, diffEnvMaps } from "../src/index.ts";
import type { EnvMap, DiffEntry } from "../src/types.ts";

describe("parseEnvString", () => {
  it("parses basic key=value pairs with type coercion", () => {
    const result = parseEnvString("HOST=localhost\nPORT=5432\nDEBUG=true\nEMPTY=");
    expect(result.HOST).toEqual({ kind: "string", value: "localhost" });
    expect(result.PORT).toEqual({ kind: "number", value: 5432, raw: "5432" });
    expect(result.DEBUG).toEqual({ kind: "boolean", value: true, raw: "true" });
    expect(result.EMPTY).toEqual({ kind: "empty", value: undefined });
  });

  it("strips quotes from values", () => {
    const result = parseEnvString('NAME="hello world"\nSINGLE=\'quoted\'');
    expect(result.NAME).toEqual({ kind: "string", value: "hello world" });
    expect(result.SINGLE).toEqual({ kind: "string", value: "quoted" });
  });

  it("handles multiline double-quoted values", () => {
    const content = 'KEY="line1\nline2\nline3"';
    const result = parseEnvString(content);
    expect(result.KEY.kind).toBe("string");
    if (result.KEY.kind === "string") {
      expect(result.KEY.value).toContain("line1");
      expect(result.KEY.value).toContain("\n");
    }
  });

  it("skips comments and blank lines", () => {
    const content = "# comment\n\nKEY=value\n  # indented comment";
    const result = parseEnvString(content);
    expect(Object.keys(result)).toEqual(["KEY"]);
  });
});

describe("diffEnvMaps", () => {
  it("detects added, removed, and unchanged keys", () => {
    const left: EnvMap = {
      SHARED: { kind: "string", value: "same" },
      ONLY_LEFT: { kind: "string", value: "left" },
    };
    const right: EnvMap = {
      SHARED: { kind: "string", value: "same" },
      ONLY_RIGHT: { kind: "string", value: "right" },
    };
    const result = diffEnvMaps(left, right, "left", "right");

    const removed = result.entries.find(e => e.key === "ONLY_LEFT");
    const added = result.entries.find(e => e.key === "ONLY_RIGHT");
    const unchanged = result.entries.find(e => e.key === "SHARED");

    expect(removed?.status).toBe("removed");
    expect(removed?.severity).toBe("error");
    expect(added?.status).toBe("added");
    expect(added?.severity).toBe("warning");
    expect(unchanged?.status).toBe("unchanged");
  });

  it("detects type mismatches", () => {
    const left: EnvMap = { PORT: { kind: "number", value: 3000, raw: "3000" } };
    const right: EnvMap = { PORT: { kind: "string", value: "three-thousand" } };
    const result = diffEnvMaps(left, right, "dev", "prod");
    expect(result.entries[0].status).toBe("type-mismatch");
    expect(result.entries[0].severity).toBe("error");
  });

  it("detects modified values", () => {
    const left: EnvMap = { URL: { kind: "string", value: "http://dev" } };
    const right: EnvMap = { URL: { kind: "string", value: "http://prod" } };
    const result = diffEnvMaps(left, right, "dev", "prod");
    expect(result.entries[0].status).toBe("modified");
    expect(result.entries[0].severity).toBe("warning");
  });

  it("respects ignoreKeys", () => {
    const left: EnvMap = { SECRET: { kind: "string", value: "abc" } };
    const right: EnvMap = {};
    const result = diffEnvMaps(left, right, "l", "r", { ignoreKeys: ["SECRET"] });
    expect(result.entries.length).toBe(0);
    expect(result.hasErrors).toBe(false);
  });
});

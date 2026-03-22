import { describe, it, expect } from "bun:test";
import { parseEnvString, diffEnvMaps } from "../src/index.ts";
// REMOVED: broken import — none of {EnvMap, DiffEntry} exist in index.ts;

describe("parseEnvString", () => {
  it("correctly parses quoted values, comments, and empty values", () => {
    const content = `
      # Database configuration
      HOST=localhost
      PORT="5432"
      DEBUG='true'
      EMPTY=
      # End of config
    `;
    
    const result = parseEnvString(content);
    
    expect(result.HOST).toBe("localhost");
    expect(result.PORT).toBe("5432");
    expect(result.DEBUG).toBe("true");
    expect(result.EMPTY).toBe("");
  });

  it("handles multiline double-quoted values", () => {
    const content = `PRIVATE_KEY="-----BEGIN KEY-----
ABC123
-----END KEY-----"`;
    
    const result = parseEnvString(content);
    
    expect(result.PRIVATE_KEY).toContain("BEGIN KEY");
    expect(result.PRIVATE_KEY).toContain("\n");
    expect(result.PRIVATE_KEY).toContain("END KEY");
  });
});

describe("diffEnvMaps", () => {
  it("detects keys present only in left as removed and only in right as added", () => {
    const left = {
      SHARED: "value",
      ONLY_LEFT: "left-value"
    } as unknown as EnvMap;
    
    const right = {
      SHARED: "value",
      ONLY_RIGHT: "right-value"
    } as unknown as EnvMap;
    
    const result = diffEnvMaps(left, right, ".env.example", ".env.production");
    
    const removedEntry = result.entries.find((e: DiffEntry) => e.key === "ONLY_LEFT");
    const addedEntry = result.entries.find((e: DiffEntry) => e.key === "ONLY_RIGHT");
    
    expect(removedEntry?.status).toBe("removed");
    expect(removedEntry?.severity).toBe("error");
    expect(addedEntry?.status).toBe("added");
    expect(addedEntry?.severity).toBe("warning");
  });

  it("detects type-mismatch when one value is numeric and other is alphabetic", () => {
    const left = {
      PORT: 3000
    } as unknown as EnvMap;
    
    const right = {
      PORT: "three-thousand"
    } as unknown as EnvMap;
    
    const result = diffEnvMaps(left, right, "staging", "production");
    const portEntry = result.entries.find((e: DiffEntry) => e.key === "PORT");
    
    expect(portEntry?.status).toBe("type-mismatch");
    expect(portEntry?.severity).toBe("error");
  });

  it("respects ignoreKeys option and sets hasErrors based on remaining differences", () => {
    const left = {
      SECRET_KEY: "abc123",
      PUBLIC_KEY: "pub456"
    } as unknown as EnvMap;
    
    const right = {
      PUBLIC_KEY: "pub456"
    } as unknown as EnvMap;
    
    const resultWithIgnore = diffEnvMaps(left, right, "local", "prod", {
      ignoreKeys: ["SECRET_KEY"]
    });
    
    const resultWithoutIgnore = diffEnvMaps(left, right, "local", "prod");
    
    expect(resultWithIgnore.entries.some((e: DiffEntry) => e.key === "SECRET_KEY")).toBe(false);
    expect(resultWithoutIgnore.entries.some((e: DiffEntry) => e.key === "SECRET_KEY")).toBe(true);
    expect(resultWithIgnore.hasErrors).toBe(false);
    expect(resultWithoutIgnore.hasErrors).toBe(true);
  });
});
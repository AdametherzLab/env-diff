import { describe, it, expect } from "bun:test";
import { diffEnvMaps } from "../src/index.ts";
import type { EnvMap } from "../src/types.ts";

describe("diffEnvMaps - all DiffStatus values", () => {
  it("reports 'added' for keys only in right", () => {
    const left: EnvMap = {};
    const right: EnvMap = { NEW_KEY: { kind: "string", value: "val" } };
    const result = diffEnvMaps(left, right, "left", "right");
    expect(result.entries[0].status).toBe("added");
    expect(result.entries[0].severity).toBe("warning");
    expect(result.entries[0].left).toBeUndefined();
    expect(result.entries[0].right).toEqual({ kind: "string", value: "val" });
  });

  it("reports 'removed' for keys only in left", () => {
    const left: EnvMap = { OLD_KEY: { kind: "string", value: "val" } };
    const right: EnvMap = {};
    const result = diffEnvMaps(left, right, "left", "right");
    expect(result.entries[0].status).toBe("removed");
    expect(result.entries[0].severity).toBe("error");
    expect(result.entries[0].right).toBeUndefined();
  });

  it("reports 'modified' for same-type different-value keys", () => {
    const left: EnvMap = { KEY: { kind: "string", value: "old" } };
    const right: EnvMap = { KEY: { kind: "string", value: "new" } };
    const result = diffEnvMaps(left, right, "left", "right");
    expect(result.entries[0].status).toBe("modified");
    expect(result.entries[0].severity).toBe("warning");
  });

  it("reports 'unchanged' for identical keys and values", () => {
    const left: EnvMap = { KEY: { kind: "number", value: 42, raw: "42" } };
    const right: EnvMap = { KEY: { kind: "number", value: 42, raw: "42" } };
    const result = diffEnvMaps(left, right, "left", "right");
    expect(result.entries[0].status).toBe("unchanged");
    expect(result.entries[0].severity).toBe("info");
  });

  it("reports 'type-mismatch' when kinds differ", () => {
    const left: EnvMap = { PORT: { kind: "number", value: 3000, raw: "3000" } };
    const right: EnvMap = { PORT: { kind: "boolean", value: true, raw: "true" } };
    const result = diffEnvMaps(left, right, "left", "right");
    expect(result.entries[0].status).toBe("type-mismatch");
    expect(result.entries[0].severity).toBe("error");
  });
});

describe("diffEnvMaps - case-insensitive mode", () => {
  it("matches API_KEY with api_key when caseSensitive is false", () => {
    const left: EnvMap = { API_KEY: { kind: "string", value: "abc" } };
    const right: EnvMap = { api_key: { kind: "string", value: "abc" } };
    const result = diffEnvMaps(left, right, "left", "right", { caseSensitive: false });
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].status).toBe("unchanged");
  });

  it("treats API_KEY and api_key as separate keys when caseSensitive is true", () => {
    const left: EnvMap = { API_KEY: { kind: "string", value: "abc" } };
    const right: EnvMap = { api_key: { kind: "string", value: "abc" } };
    const result = diffEnvMaps(left, right, "left", "right", { caseSensitive: true });
    expect(result.entries.length).toBe(2);
    const removed = result.entries.find(e => e.key === "API_KEY");
    const added = result.entries.find(e => e.key === "api_key");
    expect(removed?.status).toBe("removed");
    expect(added?.status).toBe("added");
  });
});

describe("diffEnvMaps - compareValues=false", () => {
  it("reports different values as unchanged when compareValues is false", () => {
    const left: EnvMap = { KEY: { kind: "string", value: "old" } };
    const right: EnvMap = { KEY: { kind: "string", value: "new" } };
    const result = diffEnvMaps(left, right, "left", "right", { compareValues: false });
    expect(result.entries[0].status).toBe("unchanged");
    expect(result.entries[0].severity).toBe("info");
  });

  it("still detects type mismatches when compareValues is false", () => {
    const left: EnvMap = { KEY: { kind: "string", value: "text" } };
    const right: EnvMap = { KEY: { kind: "number", value: 42, raw: "42" } };
    const result = diffEnvMaps(left, right, "left", "right", { compareValues: false });
    expect(result.entries[0].status).toBe("type-mismatch");
  });
});

describe("diffEnvMaps - label validation", () => {
  it("throws TypeError for empty left label", () => {
    expect(() => diffEnvMaps({}, {}, "", "right")).toThrow(TypeError);
  });

  it("throws TypeError for empty right label", () => {
    expect(() => diffEnvMaps({}, {}, "left", "")).toThrow(TypeError);
  });

  it("throws TypeError for whitespace-only labels", () => {
    expect(() => diffEnvMaps({}, {}, "  ", "right")).toThrow(TypeError);
  });
});

describe("diffEnvMaps - hasErrors and hasWarnings", () => {
  it("hasErrors is true when removed keys exist", () => {
    const left: EnvMap = { KEY: { kind: "string", value: "val" } };
    const result = diffEnvMaps(left, {}, "l", "r");
    expect(result.hasErrors).toBe(true);
    expect(result.hasWarnings).toBe(false);
  });

  it("hasWarnings is true when only warnings exist (no errors)", () => {
    const left: EnvMap = { KEY: { kind: "string", value: "old" } };
    const right: EnvMap = { KEY: { kind: "string", value: "new" } };
    const result = diffEnvMaps(left, right, "l", "r");
    expect(result.hasErrors).toBe(false);
    expect(result.hasWarnings).toBe(true);
  });

  it("hasWarnings is false when errors exist even if warnings also exist", () => {
    const left: EnvMap = {
      MISSING: { kind: "string", value: "gone" },
      CHANGED: { kind: "string", value: "old" },
    };
    const right: EnvMap = {
      CHANGED: { kind: "string", value: "new" },
    };
    const result = diffEnvMaps(left, right, "l", "r");
    expect(result.hasErrors).toBe(true);
    // hasWarnings is false when hasErrors is true (per implementation)
    expect(result.hasWarnings).toBe(false);
  });

  it("both false when all entries are unchanged", () => {
    const env: EnvMap = { KEY: { kind: "string", value: "same" } };
    const result = diffEnvMaps(env, env, "l", "r");
    expect(result.hasErrors).toBe(false);
    expect(result.hasWarnings).toBe(false);
  });
});

describe("diffEnvMaps - sorting", () => {
  it("entries are sorted alphabetically by key", () => {
    const left: EnvMap = {
      ZEBRA: { kind: "string", value: "z" },
      ALPHA: { kind: "string", value: "a" },
      MIDDLE: { kind: "string", value: "m" },
    };
    const result = diffEnvMaps(left, left, "l", "r");
    const keys = result.entries.map(e => e.key);
    expect(keys).toEqual(["ALPHA", "MIDDLE", "ZEBRA"]);
  });
});

describe("diffEnvMaps - multiple ignoreKeys", () => {
  it("ignores multiple specified keys", () => {
    const left: EnvMap = {
      SECRET: { kind: "string", value: "s1" },
      TOKEN: { kind: "string", value: "t1" },
      PUBLIC: { kind: "string", value: "p1" },
    };
    const right: EnvMap = {
      PUBLIC: { kind: "string", value: "p1" },
    };
    const result = diffEnvMaps(left, right, "l", "r", {
      ignoreKeys: ["SECRET", "TOKEN"],
    });
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].key).toBe("PUBLIC");
    expect(result.hasErrors).toBe(false);
  });
});

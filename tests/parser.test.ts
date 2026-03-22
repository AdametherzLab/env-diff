import { describe, it, expect } from "bun:test";
import * as path from "path";
import { parseEnvString, parseEnvFile, parseProcessEnv } from "../src/index.ts";
import type { EnvMap } from "../src/types.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");

describe("parseEnvString - basic values", () => {
  it("parses unquoted string values", () => {
    const result = parseEnvString("HOST=localhost");
    expect(result.HOST).toEqual({ kind: "string", value: "localhost" });
  });

  it("parses double-quoted values and strips quotes", () => {
    const result = parseEnvString('NAME="hello world"');
    expect(result.NAME).toEqual({ kind: "string", value: "hello world" });
  });

  it("parses single-quoted values and strips quotes", () => {
    const result = parseEnvString("GREETING='hi there'");
    expect(result.GREETING).toEqual({ kind: "string", value: "hi there" });
  });
});

describe("parseEnvString - type coercion", () => {
  it("coerces integers to number type", () => {
    const result = parseEnvString("PORT=8080");
    expect(result.PORT).toEqual({ kind: "number", value: 8080, raw: "8080" });
  });

  it("coerces floats to number type", () => {
    const result = parseEnvString("RATE=3.14");
    expect(result.RATE).toEqual({ kind: "number", value: 3.14, raw: "3.14" });
  });

  it("coerces negative numbers", () => {
    const result = parseEnvString("OFFSET=-10");
    expect(result.OFFSET).toEqual({ kind: "number", value: -10, raw: "-10" });
  });

  it("coerces true/false to boolean type", () => {
    const result = parseEnvString("A=true\nB=false");
    expect(result.A).toEqual({ kind: "boolean", value: true, raw: "true" });
    expect(result.B).toEqual({ kind: "boolean", value: false, raw: "false" });
  });

  it("coerces yes/no to boolean type", () => {
    const result = parseEnvString("A=yes\nB=no");
    expect(result.A).toEqual({ kind: "boolean", value: true, raw: "yes" });
    expect(result.B).toEqual({ kind: "boolean", value: false, raw: "no" });
  });

  it("coerces on/off to boolean type", () => {
    const result = parseEnvString("A=on\nB=off");
    expect(result.A).toEqual({ kind: "boolean", value: true, raw: "on" });
    expect(result.B).toEqual({ kind: "boolean", value: false, raw: "off" });
  });

  it("coerces boolean case-insensitively", () => {
    const result = parseEnvString("A=TRUE\nB=False\nC=YES");
    expect(result.A).toEqual({ kind: "boolean", value: true, raw: "TRUE" });
    expect(result.B).toEqual({ kind: "boolean", value: false, raw: "False" });
    expect(result.C).toEqual({ kind: "boolean", value: true, raw: "YES" });
  });

  it("treats empty value as empty type", () => {
    const result = parseEnvString("EMPTY=");
    expect(result.EMPTY).toEqual({ kind: "empty", value: undefined });
  });

  it("keeps non-numeric strings as string type", () => {
    const result = parseEnvString("URL=http://example.com");
    expect(result.URL.kind).toBe("string");
  });
});

describe("parseEnvString - comments", () => {
  it("skips full-line comments", () => {
    const result = parseEnvString("# this is a comment\nKEY=value");
    expect(Object.keys(result)).toEqual(["KEY"]);
  });

  it("strips inline comments from unquoted values", () => {
    const result = parseEnvString("KEY=value # this is a comment");
    expect(result.KEY).toEqual({ kind: "string", value: "value" });
  });

  it("preserves hash inside double-quoted values", () => {
    const result = parseEnvString('URL="http://host/#path"');
    expect(result.URL).toEqual({ kind: "string", value: "http://host/#path" });
  });

  it("preserves hash inside single-quoted values", () => {
    const result = parseEnvString("URL='http://host/#path'");
    expect(result.URL).toEqual({ kind: "string", value: "http://host/#path" });
  });
});

describe("parseEnvString - export prefix", () => {
  it("strips export prefix", () => {
    const result = parseEnvString("export DATABASE_URL=postgres://localhost");
    expect(result.DATABASE_URL).toEqual({ kind: "string", value: "postgres://localhost" });
  });

  it("strips export prefix with extra spaces", () => {
    const result = parseEnvString("export   KEY=value");
    expect(result.KEY).toEqual({ kind: "string", value: "value" });
  });
});

describe("parseEnvString - multiline values", () => {
  it("handles multiline double-quoted values (PEM key style)", () => {
    const content = 'PRIVATE_KEY="-----BEGIN RSA KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA KEY-----"';
    const result = parseEnvString(content);
    expect(result.PRIVATE_KEY.kind).toBe("string");
    if (result.PRIVATE_KEY.kind === "string") {
      expect(result.PRIVATE_KEY.value).toContain("BEGIN RSA KEY");
      expect(result.PRIVATE_KEY.value).toContain("\n");
      expect(result.PRIVATE_KEY.value).toContain("END RSA KEY");
    }
  });
});

describe("parseEnvString - variable expansion", () => {
  it("expands ${VAR} references", () => {
    const content = "HOST=localhost\nURL=http://${HOST}:3000";
    const result = parseEnvString(content, { expandVariables: true });
    expect(result.URL).toEqual({ kind: "string", value: "http://localhost:3000" });
  });

  it("expands $VAR references", () => {
    const content = "HOST=localhost\nURL=http://$HOST:3000";
    const result = parseEnvString(content, { expandVariables: true });
    // $HOST gets expanded; :3000 remains
    expect(result.URL.kind).toBe("string");
    if (result.URL.kind === "string") {
      expect(result.URL.value).toContain("localhost");
    }
  });

  it("replaces undefined variable references with empty string", () => {
    const content = "URL=http://${UNDEFINED_VAR}/path";
    const result = parseEnvString(content, { expandVariables: true });
    expect(result.URL).toEqual({ kind: "string", value: "http:///path" });
  });

  it("does not expand variables in single-quoted values", () => {
    const content = "HOST=localhost\nURL='http://${HOST}:3000'";
    const result = parseEnvString(content, { expandVariables: true });
    expect(result.URL).toEqual({ kind: "string", value: "http://${HOST}:3000" });
  });

  it("does not expand when expandVariables is not set", () => {
    const content = "HOST=localhost\nURL=http://${HOST}:3000";
    const result = parseEnvString(content);
    expect(result.URL).toEqual({ kind: "string", value: "http://${HOST}:3000" });
  });
});

describe("parseEnvString - strict mode", () => {
  it("throws SyntaxError on malformed lines in strict mode", () => {
    expect(() => parseEnvString("NO_EQUALS_SIGN", { strict: true })).toThrow(SyntaxError);
  });

  it("throws SyntaxError on empty key in strict mode", () => {
    expect(() => parseEnvString("=value", { strict: true })).toThrow(SyntaxError);
  });

  it("silently skips malformed lines when not in strict mode", () => {
    const result = parseEnvString("NO_EQUALS_SIGN\nKEY=value");
    expect(Object.keys(result)).toEqual(["KEY"]);
  });
});

describe("parseEnvString - edge cases", () => {
  it("handles equals signs in values", () => {
    const result = parseEnvString("URL=http://host?a=1&b=2");
    expect(result.URL).toEqual({ kind: "string", value: "http://host?a=1&b=2" });
  });

  it("trims spaces around keys", () => {
    const result = parseEnvString("  KEY  =value");
    expect(result.KEY).toEqual({ kind: "string", value: "value" });
  });

  it("trims trailing whitespace from unquoted values", () => {
    const result = parseEnvString("KEY=value   ");
    expect(result.KEY).toEqual({ kind: "string", value: "value" });
  });

  it("handles Windows line endings", () => {
    const result = parseEnvString("A=1\r\nB=2\r\n");
    expect(result.A).toEqual({ kind: "number", value: 1, raw: "1" });
    expect(result.B).toEqual({ kind: "number", value: 2, raw: "2" });
  });

  it("handles blank lines between entries", () => {
    const result = parseEnvString("A=1\n\n\nB=2");
    expect(Object.keys(result)).toEqual(["A", "B"]);
  });
});

describe("parseEnvFile", () => {
  it("parses a fixture file from disk", () => {
    const filePath = path.join(fixturesDir, ".env.example");
    const result = parseEnvFile(filePath);
    expect(result.APP_NAME).toEqual({ kind: "string", value: "my-app" });
    expect(result.PORT).toEqual({ kind: "number", value: 3000, raw: "3000" });
    expect(result.DEBUG).toEqual({ kind: "boolean", value: true, raw: "true" });
    expect(result.EMPTY_VAR).toEqual({ kind: "empty", value: undefined });
  });
});

describe("parseProcessEnv", () => {
  it("returns an EnvMap from current process.env with PATH present", () => {
    const result = parseProcessEnv();
    // PATH (or Path on Windows) should exist in some form
    const keys = Object.keys(result);
    const hasPath = keys.some(k => k.toLowerCase() === "path");
    expect(hasPath).toBe(true);
  });
});

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatJson, JsonParseError, parseJson } from "../src/commands/json.js";
import { cli, cliWithStdin, type Sandbox, sandbox } from "./helpers.js";

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":[1,2]}')).toEqual({ a: [1, 2] });
  });

  it("reports line and column when V8 gives a position", () => {
    expect(() => parseJson('{\n  "a": 1\n  "b": 2\n}')).toThrow(
      "line 3, column 3: Expected ',' or '}' after property value",
    );
  });

  it("strips the echoed input from messages without a position", () => {
    expect(() => parseJson("[1,2,]")).toThrow(/^Unexpected token '\]'$/);
  });

  it("rejects empty input", () => {
    expect(() => parseJson("  \n")).toThrow(JsonParseError);
    expect(() => parseJson("")).toThrow("Input is empty.");
  });
});

describe("formatJson", () => {
  it("indents or minifies", () => {
    expect(formatJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
    expect(formatJson({ a: 1 }, 4)).toBe('{\n    "a": 1\n}');
    expect(formatJson({ a: [1, 2] }, 2, true)).toBe('{"a":[1,2]}');
  });
});

describe("mydk json", () => {
  let file: string;
  beforeEach(() => {
    file = join(box.cwd, "data.json");
    writeFileSync(file, '{"name":"mydk","tags":["cli","json"]}');
  });

  it("formats a file with the default indent", async () => {
    expect((await cli(box, "json", file)).line).toBe(
      '{\n  "name": "mydk",\n  "tags": [\n    "cli",\n    "json"\n  ]\n}',
    );
  });

  it("supports --minify and --indent", async () => {
    expect((await cli(box, "json", file, "--minify")).line).toBe(
      '{"name":"mydk","tags":["cli","json"]}',
    );
    expect((await cli(box, "json", file, "--indent", "4")).line).toMatch(/^ {4}"name"/m);
    expect((await cli(box, "json", file, "--indent", "11")).stderr).toMatch(/between 1 and 10/);
  });

  it("uses json.indent from config", async () => {
    box.writeUserConfig({ json: { indent: 3 } });
    expect((await cli(box, "json", file)).line).toMatch(/^ {3}"name"/m);
  });

  it("reads stdin when no file is given or the file is -", async () => {
    expect((await cliWithStdin(box, "[1, 2]", "json", "--minify")).line).toBe("[1,2]");
    expect((await cliWithStdin(box, "[1, 2]", "json", "-", "--minify")).line).toBe("[1,2]");
  });

  it("fails when there is no input at all", async () => {
    const result = await cliWithStdin(box, undefined, "json");
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/No input/);
  });

  it("reports invalid JSON with the source and position, exit code 1", async () => {
    writeFileSync(file, '{\n  "a": 1\n  "b": 2\n}');
    const result = await cli(box, "json", file);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Invalid JSON in ${file}: line 3, column 3`);
    expect((await cliWithStdin(box, "{", "json")).stderr).toMatch(/Invalid JSON in stdin/);
  });

  it("--check validates without printing the document", async () => {
    expect((await cli(box, "json", file, "--check")).line).toBe(`Valid JSON (${file})`);
    const result = await cli(box, "json", file, "--check", "--json");
    expect(JSON.parse(result.stdout)).toEqual({ valid: true, source: file });
  });
});

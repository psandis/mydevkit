import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cli, type Sandbox, sandbox } from "./helpers.js";

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

describe("pass", () => {
  it("uses the default length and accepts a length argument", async () => {
    expect((await cli(box, "pass")).line).toHaveLength(20);
    expect((await cli(box, "pass", "15")).line).toHaveLength(15);
  });

  it("draws only from the given alphabet", async () => {
    const { line } = await cli(box, "pass", "50", "--alphabet", "ab");
    expect(line).toMatch(/^[ab]{50}$/);
  });

  it("rejects invalid lengths and alphabets", async () => {
    for (const value of ["0", "-1", "1.5", "4097", "abc"]) {
      const result = await cli(box, "pass", value);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Length must be an integer between 1 and 4096/);
    }
    const result = await cli(box, "pass", "--alphabet", "aaa");
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/at least 2 different characters/);
  });
});

describe("token", () => {
  it("defaults to 32 bytes of hex", async () => {
    expect((await cli(box, "token")).line).toMatch(/^[a-f0-9]{64}$/);
    expect((await cli(box, "token", "8")).line).toMatch(/^[a-f0-9]{16}$/);
  });

  it("supports base64 and base64url encodings", async () => {
    expect((await cli(box, "token", "--encoding", "base64")).line).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect((await cli(box, "token", "-e", "base64url")).line).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects unknown encodings", async () => {
    const result = await cli(box, "token", "--encoding", "binary");
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Allowed choices are hex, base64, base64url/);
  });
});

describe("uuid", () => {
  it("generates a UUID v4", async () => {
    expect((await cli(box, "uuid")).line).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });

  it("rejects extra arguments", async () => {
    expect((await cli(box, "uuid", "extra")).code).toBe(1);
  });
});

describe("hash", () => {
  const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  let file: string;
  beforeEach(() => {
    file = join(box.cwd, "example.txt");
    writeFileSync(file, "abc");
  });

  it("hashes with the default algorithm, an argument, or a flag", async () => {
    expect((await cli(box, "hash", file)).line).toBe(ABC_SHA256);
    expect((await cli(box, "hash", "sha256", file)).line).toBe(ABC_SHA256);
    expect((await cli(box, "hash", "-a", "sha512", file)).line).toHaveLength(128);
  });

  it("rejects unsupported algorithms, missing files, and conflicting input", async () => {
    expect((await cli(box, "hash", "md5", file)).stderr).toMatch(/Supported algorithms/);
    expect((await cli(box, "hash", join(box.cwd, "missing"))).stderr).toMatch(/ENOENT/);
    expect((await cli(box, "hash")).stderr).toMatch(/Missing file/);
    expect((await cli(box, "hash", "-a", "sha256", "sha512", file)).stderr).toMatch(/not both/);
  });
});

describe("help and errors", () => {
  it("shows help with no arguments and exits 0", async () => {
    const result = await cli(box);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Usage: mydk/);
  });

  it("shows command help with current settings", async () => {
    for (const args of [
      ["help", "pass"],
      ["pass", "--help"],
    ]) {
      const result = await cli(box, ...args);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/length\s+20\s+\(pass\.length, from built-in default\)/);
    }
  });

  it("prints the version", async () => {
    expect((await cli(box, "--version")).line).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("rejects unknown commands with exit code 1", async () => {
    const result = await cli(box, "nope");
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^mydk: unknown command 'nope'/);
  });
});

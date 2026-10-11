import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cli, type Sandbox, sandbox } from "./helpers.js";

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

const json = async (...args: string[]) => {
  const result = await cli(box, ...args);
  return { ...result, data: result.stdout ? JSON.parse(result.stdout) : undefined };
};

describe("--json flag", () => {
  it("works on every generator", async () => {
    const pass = await json("pass", "12", "--json");
    expect(pass.data).toEqual({ password: expect.any(String), length: 12 });
    expect(pass.data.password).toHaveLength(12);

    expect((await json("token", "8", "--json")).data).toEqual({
      token: expect.stringMatching(/^[a-f0-9]{16}$/),
      bytes: 8,
      encoding: "hex",
    });
    expect((await json("uuid", "--json")).data.uuid).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("is accepted before the command too", async () => {
    expect((await json("--json", "uuid")).data.uuid).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("works on hash", async () => {
    const file = join(box.cwd, "abc.txt");
    writeFileSync(file, "abc");
    expect((await json("hash", file, "--json")).data).toEqual({
      file,
      algorithm: "sha256",
      hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("works on config commands", async () => {
    expect((await json("config", "show", "--json")).data.pass.length).toBe(20);
    const paths = (await json("config", "path", "--json")).data;
    expect(paths.map((f: { scope: string }) => f.scope)).toEqual(["user", "project"]);
    expect((await json("config", "init", "--json")).data.written).toBe(
      join(box.home, ".mydk", "config.json"),
    );
  });

  it("prints errors as JSON on stderr with the exit code", async () => {
    const usage = await cli(box, "pass", "0", "--json");
    expect(usage.code).toBe(1);
    expect(JSON.parse(usage.stderr)).toEqual({
      error: "Length must be an integer between 1 and 4096.",
      exitCode: 1,
    });

    const unknown = await cli(box, "nope", "--json");
    expect(JSON.parse(unknown.stderr).error).toMatch(/unknown command 'nope'/);

    box.writeUserConfig({ pass: { length: "long" } });
    const config = await cli(box, "pass", "--json");
    expect(config.code).toBe(2);
    expect(JSON.parse(config.stderr)).toMatchObject({ exitCode: 2 });
  });
});

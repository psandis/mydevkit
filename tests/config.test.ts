import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, readDefaults } from "../src/config/load.js";
import { ConfigError } from "../src/config/types.js";
import { cli, type Sandbox, sandbox } from "./helpers.js";

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

describe("loadConfig", () => {
  it("returns the built-in defaults when no config files exist", () => {
    const { config, sources } = loadConfig(box);
    expect(config).toEqual(readDefaults());
    expect(sources["pass.length"]).toBe("defaults");
  });

  it("merges user config, then project config", () => {
    box.writeUserConfig({ pass: { length: 30 }, token: { bytes: 16 } });
    box.writeProjectConfig({ pass: { length: 40 } });
    const { config, sources } = loadConfig(box);
    expect(config.pass.length).toBe(40);
    expect(config.token.bytes).toBe(16);
    expect(config.pass.alphabet).toBe(readDefaults().pass.alphabet);
    expect(sources["pass.length"]).toBe(join(box.cwd, ".mydk.json"));
    expect(sources["token.bytes"]).toBe(join(box.home, ".mydk", "config.json"));
  });

  it("rejects unknown keys, bad values, and invalid JSON", () => {
    box.writeUserConfig({ pass: { lenght: 30 } });
    expect(() => loadConfig(box)).toThrow(/unknown key "pass.lenght"/);

    box.writeUserConfig({ token: { encoding: "binary" } });
    expect(() => loadConfig(box)).toThrow(/"token.encoding" must be one of/);

    box.writeUserConfig({ hash: { algorithm: "sha1" } });
    expect(() => loadConfig(box)).toThrow(/"hash.algorithm" must be one of/);

    box.writeUserConfig({ limits: { maxSize: 10 }, pass: { length: 20 } });
    expect(() => loadConfig(box)).toThrow(/"pass.length" must be an integer between 1 and 10/);

    box.writeProjectConfig("not an object");
    expect(() => loadConfig(box)).toThrow(ConfigError);
  });
});

describe("config in the CLI", () => {
  it("uses config values as defaults, and flags override them", async () => {
    box.writeUserConfig({ pass: { length: 8, alphabet: "xy" }, token: { encoding: "base64url" } });
    expect((await cli(box, "pass")).line).toMatch(/^[xy]{8}$/);
    expect((await cli(box, "pass", "4", "--alphabet", "01")).line).toMatch(/^[01]{4}$/);
    expect((await cli(box, "token", "3")).line).toMatch(/^[A-Za-z0-9_-]{4}$/);
  });

  it("exits 2 with a clear message on a bad config file", async () => {
    box.writeUserConfig({ pass: { length: "long" } });
    const result = await cli(box, "pass");
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/"pass.length" must be an integer/);
  });

  it("still shows help when the config file is broken", async () => {
    box.writeUserConfig({ pass: { length: "long" } });
    const result = await cli(box, "help", "pass");
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Current settings unavailable/);
  });

  it("config show lists every value with its source", async () => {
    box.writeProjectConfig({ token: { bytes: 64 } });
    const { stdout } = await cli(box, "config", "show");
    expect(stdout).toMatch(/token\.bytes\s+64\s+\(.*\.mydk\.json\)/);
    expect(stdout).toMatch(/pass\.length\s+20\s+\(built-in default\)/);
    const json = JSON.parse((await cli(box, "config", "show", "--json")).stdout);
    expect(json.token.bytes).toBe(64);
  });

  it("config path lists files in merge order", async () => {
    const { stdout } = await cli(box, "config", "path");
    expect(stdout).toMatch(/^user\s+~\/\.mydk\/config\.json\s+\(not found\)/);
    expect(stdout).toMatch(/project\s+.*\.mydk\.json\s+\(not found\)/);
  });

  it("config init writes defaults and refuses to overwrite without --force", async () => {
    const userFile = join(box.home, ".mydk", "config.json");
    expect((await cli(box, "config", "init")).code).toBe(0);
    expect(JSON.parse(readFileSync(userFile, "utf8"))).toEqual(readDefaults());

    const again = await cli(box, "config", "init");
    expect(again.code).toBe(1);
    expect(again.stderr).toMatch(/already exists/);
    expect((await cli(box, "config", "init", "--force")).code).toBe(0);

    expect((await cli(box, "config", "init", "--project")).code).toBe(0);
    expect(existsSync(join(box.cwd, ".mydk.json"))).toBe(true);
  });
});

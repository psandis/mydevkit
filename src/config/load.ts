import { getHashes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type Config,
  ConfigError,
  type ConfigFile,
  type LoadedConfig,
  type Sources,
  TOKEN_ENCODINGS,
} from "./types.js";

const DEFAULTS_URL = new URL("../../data/defaults.json", import.meta.url);

export const USER_CONFIG_DIR = ".mydk";
export const USER_CONFIG_FILE = "config.json";
export const PROJECT_CONFIG_FILE = ".mydk.json";

export interface LoadOptions {
  home?: string;
  cwd?: string;
}

export function readDefaults(): Config {
  return JSON.parse(readFileSync(DEFAULTS_URL, "utf8")) as Config;
}

export function configFiles(options: LoadOptions = {}): ConfigFile[] {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const user = join(home, USER_CONFIG_DIR, USER_CONFIG_FILE);
  const project = join(cwd, PROJECT_CONFIG_FILE);
  return [
    { path: user, scope: "user", found: existsSync(user) },
    { path: project, scope: "project", found: existsSync(project) },
  ];
}

/** Merge order: defaults, user config, project config. Later files win. */
export function loadConfig(options: LoadOptions = {}): LoadedConfig {
  const defaults = readDefaults();
  const config = structuredClone(defaults);
  const sources: Sources = {};
  for (const [section, values] of Object.entries(defaults)) {
    for (const key of Object.keys(values)) sources[`${section}.${key}`] = "defaults";
  }

  const files = configFiles(options);
  for (const file of files) {
    if (!file.found) continue;
    applyOverrides(config, sources, readConfigFile(file.path), file.path, defaults);
  }

  validate(config, sources);
  return { config, sources, files };
}

function readConfigFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`Cannot read ${path}: ${(error as Error).message}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyOverrides(
  config: Config,
  sources: Sources,
  overrides: unknown,
  path: string,
  defaults: Config,
): void {
  if (!isObject(overrides)) throw new ConfigError(`${path}: config must be a JSON object.`);
  const target = config as unknown as Record<string, Record<string, unknown>>;
  const known = defaults as unknown as Record<string, Record<string, unknown>>;

  for (const [section, values] of Object.entries(overrides)) {
    if (section === "$schema") continue;
    if (!(section in known)) {
      throw new ConfigError(`${path}: unknown section "${section}".`);
    }
    if (!isObject(values)) throw new ConfigError(`${path}: "${section}" must be an object.`);
    for (const [key, value] of Object.entries(values)) {
      if (!(key in known[section])) {
        throw new ConfigError(`${path}: unknown key "${section}.${key}".`);
      }
      target[section][key] = value;
      sources[`${section}.${key}`] = path;
    }
  }
}

function fail(sources: Sources, key: string, message: string): never {
  throw new ConfigError(`${sources[key] ?? "config"}: "${key}" ${message}`);
}

function isSize(value: unknown, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}

export function validate(config: Config, sources: Sources): void {
  const { maxSize } = config.limits;
  if (!isSize(maxSize, 1_048_576)) {
    fail(sources, "limits.maxSize", "must be an integer between 1 and 1048576.");
  }
  if (!isSize(config.pass.length, maxSize)) {
    fail(sources, "pass.length", `must be an integer between 1 and ${maxSize}.`);
  }
  const { alphabet } = config.pass;
  if (typeof alphabet !== "string" || new Set(alphabet).size < 2) {
    fail(sources, "pass.alphabet", "must be a string with at least 2 different characters.");
  }
  if (!isSize(config.token.bytes, maxSize)) {
    fail(sources, "token.bytes", `must be an integer between 1 and ${maxSize}.`);
  }
  if (!TOKEN_ENCODINGS.includes(config.token.encoding)) {
    fail(sources, "token.encoding", `must be one of: ${TOKEN_ENCODINGS.join(", ")}.`);
  }
  const { algorithms, algorithm } = config.hash;
  const available = getHashes();
  if (
    !Array.isArray(algorithms) ||
    algorithms.length === 0 ||
    !algorithms.every((name) => typeof name === "string" && available.includes(name))
  ) {
    fail(
      sources,
      "hash.algorithms",
      "must be a non-empty list of hash names supported by Node.js.",
    );
  }
  if (!algorithms.includes(algorithm)) {
    fail(sources, "hash.algorithm", `must be one of: ${algorithms.join(", ")}.`);
  }
}

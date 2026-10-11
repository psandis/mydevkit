export const TOKEN_ENCODINGS = ["hex", "base64", "base64url"] as const;
export type TokenEncoding = (typeof TOKEN_ENCODINGS)[number];

export interface Config {
  pass: { length: number; alphabet: string };
  token: { bytes: number; encoding: TokenEncoding };
  hash: { algorithm: string; algorithms: string[] };
  json: { indent: number };
  limits: { maxSize: number };
}

/** Where a config value came from, e.g. "defaults" or a file path. */
export type Sources = Record<string, string>;

export interface ConfigFile {
  path: string;
  scope: "user" | "project";
  found: boolean;
}

export interface LoadedConfig {
  config: Config;
  sources: Sources;
  files: ConfigFile[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

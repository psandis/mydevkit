import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { Command, CommanderError, Option } from "commander";
import { password, token, uuid } from "../commands/generate.js";
import { hashFile } from "../commands/hash.js";
import { configFiles, type LoadOptions, loadConfig, readDefaults } from "../config/load.js";
import {
  ConfigError,
  type LoadedConfig,
  TOKEN_ENCODINGS,
  type TokenEncoding,
} from "../config/types.js";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_CONFIG = 2;

export interface Io extends LoadOptions {
  out: (text: string) => void;
  err: (text: string) => void;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

class UsageError extends Error {}

function version(): string {
  const pkg = new URL("../../package.json", import.meta.url);
  return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
}

function parseSize(value: string, name: string, max: number): number {
  const number = Number(value);
  if (!/^[1-9]\d*$/.test(value) || number > max) {
    throw new UsageError(`${name} must be an integer between 1 and ${max}.`);
  }
  return number;
}

export function createProgram(io: Io = defaultIo): Command {
  const home = io.home ?? homedir();
  const cwd = io.cwd ?? process.cwd();
  const print = (text: string) => io.out(`${text}\n`);
  const tilde = (path: string) => (path.startsWith(home) ? `~${path.slice(home.length)}` : path);

  let loaded: LoadedConfig | undefined;
  const getConfig = () => {
    loaded ??= loadConfig({ home, cwd });
    return loaded;
  };

  const source = (key: string) => {
    const from = getConfig().sources[key];
    return from === "defaults" ? "built-in default" : tilde(from);
  };

  /** Help footer listing the config keys a command reads and their current values. */
  const settings = (rows: [label: string, key: string, value: () => unknown][]) => () => {
    try {
      getConfig();
    } catch (error) {
      return `\nCurrent settings unavailable: ${(error as Error).message}\n`;
    }
    const width = Math.max(...rows.map(([label]) => label.length));
    const lines = rows.map(
      ([label, key, value]) =>
        `  ${label.padEnd(width)}  ${String(value())}  (${key}, from ${source(key)})`,
    );
    return `\nCurrent settings:\n${lines.join("\n")}\n`;
  };

  const examples = (lines: string[]) => `\nExamples:\n${lines.map((l) => `  ${l}`).join("\n")}\n`;

  const program = new Command()
    .name("mydk")
    .description("mydevkit: everyday developer tools. Passwords, tokens, UUIDs, and file hashes.")
    .version(version(), "-v, --version", "Show version")
    .helpOption("-h, --help", "Show help")
    .helpCommand("help [command]", "Show help for a command")
    .showSuggestionAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: io.out,
      writeErr: io.err,
      outputError: (text, write) => write(`mydk: ${text.replace(/^error: /, "")}`),
    })
    .addHelpText(
      "after",
      () => `${examples(["mydk pass 32", "mydk token --encoding base64", "mydk hash file.zip", "mydk help pass"])}
Configuration:
  Defaults are merged with ${tilde(configFiles({ home, cwd })[0].path)} (user)
  and ./.mydk.json (project). Flags override both.
  Run "mydk config show" to see the values in use.

Exit codes:
  0  success
  1  invalid arguments or runtime error
  2  invalid config file
`,
    );

  program
    .command("pass")
    .description("Generate a cryptographically random password")
    .argument("[length]", "number of characters (default: pass.length)")
    .option("-a, --alphabet <chars>", "characters to draw from (default: pass.alphabet)")
    .addHelpText(
      "after",
      () =>
        settings([
          ["length", "pass.length", () => getConfig().config.pass.length],
          ["alphabet", "pass.alphabet", () => getConfig().config.pass.alphabet],
        ])() +
        "\nEach character is drawn independently, so a specific character class is not\nguaranteed to appear.\n" +
        examples(["mydk pass", "mydk pass 32", 'mydk pass 16 --alphabet "abcdef0123456789"']),
    )
    .action((length: string | undefined, options: { alphabet?: string }) => {
      const { config } = getConfig();
      const size = length ? parseSize(length, "Length", config.limits.maxSize) : config.pass.length;
      const alphabet = options.alphabet ?? config.pass.alphabet;
      if (new Set(alphabet).size < 2) {
        throw new UsageError("Alphabet must contain at least 2 different characters.");
      }
      print(password(size, alphabet));
    });

  program
    .command("token")
    .description("Generate a cryptographically random token")
    .argument("[bytes]", "number of random bytes (default: token.bytes)")
    .addOption(
      new Option("-e, --encoding <encoding>", "output encoding (default: token.encoding)").choices(
        TOKEN_ENCODINGS,
      ),
    )
    .addHelpText(
      "after",
      () =>
        settings([
          ["bytes", "token.bytes", () => getConfig().config.token.bytes],
          ["encoding", "token.encoding", () => getConfig().config.token.encoding],
        ])() +
        "\nLength is in bytes, not characters: 32 bytes is 64 hex characters.\n" +
        examples(["mydk token", "mydk token 16", "mydk token 32 --encoding base64url"]),
    )
    .action((bytes: string | undefined, options: { encoding?: TokenEncoding }) => {
      const { config } = getConfig();
      const size = bytes ? parseSize(bytes, "Bytes", config.limits.maxSize) : config.token.bytes;
      print(token(size, options.encoding ?? config.token.encoding));
    });

  program
    .command("uuid")
    .description("Generate a random UUID v4")
    .addHelpText("after", examples(["mydk uuid"]))
    .action(() => print(uuid()));

  program
    .command("hash")
    .description("Compute the digest of a file")
    .usage("[options] [algorithm] <file>")
    .argument("[algorithm]", "hash algorithm, optional (default: hash.algorithm)")
    .argument("[file]", "file to hash")
    .option("-a, --algorithm <name>", "hash algorithm (default: hash.algorithm)")
    .addHelpText(
      "after",
      () =>
        settings([
          ["algorithm", "hash.algorithm", () => getConfig().config.hash.algorithm],
          ["allowed", "hash.algorithms", () => getConfig().config.hash.algorithms.join(", ")],
        ])() +
        examples([
          "mydk hash file.zip",
          "mydk hash sha512 file.zip",
          "mydk hash -a sha384 file.zip",
        ]),
    )
    .action(
      async (
        first: string | undefined,
        second: string | undefined,
        options: { algorithm?: string },
      ) => {
        const { config } = getConfig();
        if (!first) throw new UsageError("Missing file. Usage: mydk hash [algorithm] <file>");
        if (second && options.algorithm) {
          throw new UsageError(
            "Give the algorithm either as an argument or with --algorithm, not both.",
          );
        }
        const file = second ?? first;
        const algorithm = (second ? first : options.algorithm) ?? config.hash.algorithm;
        if (!config.hash.algorithms.includes(algorithm)) {
          throw new UsageError(`Supported algorithms: ${config.hash.algorithms.join(", ")}.`);
        }
        print(await hashFile(file, algorithm));
      },
    );

  const configCommand = program
    .command("config")
    .description("Show, locate, or create config files")
    .addHelpText(
      "after",
      examples([
        "mydk config show",
        "mydk config path",
        "mydk config init",
        "mydk config init --project",
      ]),
    );

  configCommand
    .command("show")
    .description("Print the merged config and where each value comes from")
    .option("--json", "print the merged config as JSON")
    .action((options: { json?: boolean }) => {
      const { config } = getConfig();
      if (options.json) {
        print(JSON.stringify(config, null, 2));
        return;
      }
      const rows = Object.entries(config).flatMap(([section, values]) =>
        Object.entries(values as Record<string, unknown>).map(([key, value]) => {
          const name = `${section}.${key}`;
          const shown = Array.isArray(value) ? value.join(", ") : String(value);
          return [name, shown, source(name)];
        }),
      );
      const width = Math.max(...rows.map(([name]) => name.length));
      for (const [name, shown, from] of rows) print(`${name.padEnd(width)}  ${shown}  (${from})`);
    });

  configCommand
    .command("path")
    .description("List the config files mydk reads, in merge order")
    .action(() => {
      for (const file of configFiles({ home, cwd })) {
        print(
          `${file.scope.padEnd(7)}  ${tilde(file.path)}  (${file.found ? "found" : "not found"})`,
        );
      }
    });

  configCommand
    .command("init")
    .description("Write a starter config file with the built-in defaults")
    .option("--project", "write ./.mydk.json instead of the user config")
    .option("--force", "overwrite an existing file")
    .action((options: { project?: boolean; force?: boolean }) => {
      const files = configFiles({ home, cwd });
      const target = options.project ? files[1].path : files[0].path;
      if (existsSync(target) && !options.force) {
        throw new UsageError(`${tilde(target)} already exists. Use --force to overwrite it.`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(readDefaults(), null, 2)}\n`);
      print(`Wrote ${tilde(target)}`);
    });

  return program;
}

/** Runs the CLI and returns the exit code instead of exiting. */
export async function run(args: string[], io: Io = defaultIo): Promise<number> {
  const program = createProgram(io);
  try {
    await program.parseAsync(args.length ? args : ["--help"], { from: "user" });
    return EXIT_OK;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    const home = io.home ?? homedir();
    const message = (error as Error).message.replaceAll(`${home}/`, "~/");
    io.err(`mydk: ${message}\n`);
    return error instanceof ConfigError ? EXIT_CONFIG : EXIT_ERROR;
  }
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { Command, CommanderError, Option } from "commander";
import { password, token, uuid } from "../commands/generate.js";
import { hashFile } from "../commands/hash.js";
import { formatJson, parseJson } from "../commands/json.js";
import { decodeJwt, isExpired, timeClaims } from "../commands/jwt.js";
import {
  configFiles,
  type LoadOptions,
  loadConfig,
  MAX_JSON_INDENT,
  readDefaults,
} from "../config/load.js";
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
  /** Piped input, or undefined when stdin is a terminal. */
  readStdin?: () => Promise<string | undefined>;
}

async function readProcessStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  readStdin: readProcessStdin,
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

export function createProgram(io: Io = defaultIo, json = false): Command {
  const home = io.home ?? homedir();
  const cwd = io.cwd ?? process.cwd();
  const print = (text: string) => io.out(`${text}\n`);
  /** Prints the text normally, or the data as JSON when --json is set. */
  const emit = (text: string, data: unknown) => print(json ? JSON.stringify(data, null, 2) : text);
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

  /** Reads a file argument, or stdin when the argument is missing or "-". */
  const readInput = async (file: string | undefined, what: string) => {
    if (file && file !== "-") return { text: await readFile(file, "utf8"), name: file };
    const text = await (io.readStdin ?? readProcessStdin)();
    if (text === undefined) {
      throw new UsageError(`No input. Pass ${what} as an argument or pipe it into mydk.`);
    }
    return { text, name: "stdin" };
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
    .description(
      "mydevkit: everyday developer tools. Passwords, tokens, UUIDs, file hashes, JSON, and JWTs.",
    )
    .version(version(), "-v, --version", "Show version")
    .option("--json", "print results and errors as JSON")
    .helpOption("-h, --help", "Show help")
    .helpCommand("help [command]", "Show help for a command")
    .configureHelp({ showGlobalOptions: true })
    .showSuggestionAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: io.out,
      writeErr: io.err,
      outputError: (text, write) => {
        const message = text.replace(/^error: /, "").trimEnd();
        write(
          json
            ? `${JSON.stringify({ error: message, exitCode: EXIT_ERROR })}\n`
            : `mydk: ${message}\n`,
        );
      },
    })
    .addHelpText(
      "after",
      () => `${examples([
        "mydk pass 32",
        "mydk token --encoding base64",
        "mydk hash file.zip",
        "mydk json data.json",
        "mydk jwt eyJhbGciOi...",
        "mydk uuid --json",
        "mydk help pass",
      ])}
Configuration:
  Defaults are merged with ${tilde(configFiles({ home, cwd })[0].path)} (user)
  and ./.mydk.json (project). Flags override both.
  Run "mydk config show" to see the values in use.

Exit codes:
  0  success
  1  invalid arguments, invalid input, or runtime error
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
        examples([
          "mydk pass",
          "mydk pass 32",
          'mydk pass 16 --alphabet "abcdef0123456789"',
          "mydk pass --json",
        ]),
    )
    .action((length: string | undefined, options: { alphabet?: string }) => {
      const { config } = getConfig();
      const size = length ? parseSize(length, "Length", config.limits.maxSize) : config.pass.length;
      const alphabet = options.alphabet ?? config.pass.alphabet;
      if (new Set(alphabet).size < 2) {
        throw new UsageError("Alphabet must contain at least 2 different characters.");
      }
      const value = password(size, alphabet);
      emit(value, { password: value, length: size });
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
        examples([
          "mydk token",
          "mydk token 16",
          "mydk token 32 --encoding base64url",
          "mydk token --json",
        ]),
    )
    .action((bytes: string | undefined, options: { encoding?: TokenEncoding }) => {
      const { config } = getConfig();
      const size = bytes ? parseSize(bytes, "Bytes", config.limits.maxSize) : config.token.bytes;
      const encoding = options.encoding ?? config.token.encoding;
      const value = token(size, encoding);
      emit(value, { token: value, bytes: size, encoding });
    });

  program
    .command("uuid")
    .description("Generate a random UUID v4")
    .addHelpText("after", examples(["mydk uuid", "mydk uuid --json"]))
    .action(() => {
      const value = uuid();
      emit(value, { uuid: value });
    });

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
          "mydk hash file.zip --json",
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
        const digest = await hashFile(file, algorithm);
        emit(digest, { file, algorithm, hash: digest });
      },
    );

  program
    .command("json")
    .description("Format, minify, or validate JSON from a file or stdin")
    .argument("[file]", 'JSON file, or "-" / nothing to read stdin')
    .option("-m, --minify", "print on one line without whitespace")
    .option(
      "-i, --indent <spaces>",
      `spaces per level, 1 to ${MAX_JSON_INDENT} (default: json.indent)`,
    )
    .option("-c, --check", "only validate, print nothing but the result")
    .addHelpText(
      "after",
      () =>
        settings([["indent", "json.indent", () => getConfig().config.json.indent]])() +
        "\nInvalid JSON exits with code 1 and reports the line and column of the error.\n" +
        examples([
          "mydk json data.json",
          "mydk json data.json --minify",
          "mydk json data.json --indent 4",
          "mydk json data.json --check",
          "curl -s https://api.github.com/repos/psandis/mydevkit | mydk json",
        ]),
    )
    .action(
      async (
        file: string | undefined,
        options: { minify?: boolean; indent?: string; check?: boolean },
      ) => {
        const { config } = getConfig();
        const indent = options.indent
          ? parseSize(options.indent, "Indent", MAX_JSON_INDENT)
          : config.json.indent;
        const input = await readInput(file, "a JSON file");
        let value: unknown;
        try {
          value = parseJson(input.text);
        } catch (error) {
          throw new UsageError(`Invalid JSON in ${input.name}: ${(error as Error).message}`);
        }
        if (options.check) {
          emit(`Valid JSON (${input.name})`, { valid: true, source: input.name });
          return;
        }
        print(formatJson(value, indent, options.minify));
      },
    );

  program
    .command("jwt")
    .description("Decode a JWT and show its header, payload, and expiry (signature not verified)")
    .argument("[token]", 'the JWT, or "-" / nothing to read stdin. A "Bearer " prefix is ignored')
    .addHelpText(
      "after",
      "\nThe signature is NOT verified. Never trust a decoded token without verifying it\n" +
        "with the issuer's key in your application.\n" +
        examples([
          "mydk jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          'echo "$TOKEN" | mydk jwt',
          'mydk jwt "$TOKEN" --json | jq .payload.sub',
        ]),
    )
    .action(async (value: string | undefined) => {
      const { config } = getConfig();
      // The argument is the token itself, not a file.
      const input = value && value !== "-" ? value : (await readInput(undefined, "a JWT")).text;
      const decoded = decodeJwt(input);
      const claims = timeClaims(decoded.payload);
      if (json) {
        print(
          JSON.stringify(
            {
              header: decoded.header,
              payload: decoded.payload,
              times: Object.fromEntries(claims.map(({ claim, ...rest }) => [claim, rest])),
              expired: isExpired(decoded.payload),
              signed: decoded.signed,
              signatureVerified: false,
            },
            null,
            2,
          ),
        );
        return;
      }
      const indent = config.json.indent;
      const lines = [
        "Header",
        formatJson(decoded.header, indent),
        "",
        "Payload",
        formatJson(decoded.payload, indent),
      ];
      if (claims.length) {
        lines.push("", "Times");
        for (const { claim, date, note } of claims) lines.push(`  ${claim}  ${date}  (${note})`);
      }
      lines.push(
        "",
        decoded.signed
          ? "Signature: present, NOT verified"
          : 'Signature: none (unsigned token, alg should be "none")',
      );
      print(lines.join("\n"));
    });

  const configCommand = program
    .command("config")
    .description("Show, locate, or create config files")
    .addHelpText(
      "after",
      examples([
        "mydk config show",
        "mydk config show --json",
        "mydk config path",
        "mydk config init",
        "mydk config init --project",
      ]),
    );

  configCommand
    .command("show")
    .description("Print the merged config and where each value comes from")
    .action(() => {
      const { config } = getConfig();
      if (json) {
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
      const files = configFiles({ home, cwd });
      if (json) {
        print(JSON.stringify(files, null, 2));
        return;
      }
      for (const file of files) {
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
      emit(`Wrote ${tilde(target)}`, { written: target });
    });

  return program;
}

/** Runs the CLI and returns the exit code instead of exiting. */
export async function run(args: string[], io: Io = defaultIo): Promise<number> {
  const json = args.includes("--json");
  const program = createProgram(io, json);
  try {
    await program.parseAsync(args.length ? args : ["--help"], { from: "user" });
    return EXIT_OK;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    const home = io.home ?? homedir();
    const message = (error as Error).message.replaceAll(`${home}/`, "~/");
    const exitCode = error instanceof ConfigError ? EXIT_CONFIG : EXIT_ERROR;
    io.err(json ? `${JSON.stringify({ error: message, exitCode })}\n` : `mydk: ${message}\n`);
    return exitCode;
  }
}

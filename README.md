# mydevkit

[![npm version](https://img.shields.io/npm/v/mydevkit.svg)](https://www.npmjs.com/package/mydevkit)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A small collection of everyday developer tools in one command. Generate passwords, tokens, and UUIDs, hash a file, format JSON, or decode a JWT, without reaching for a website or a one-off script. Every default is configurable through a JSON config file. The npm package is **mydevkit**, the command is **mydk**.

## What It Does

- `pass`: cryptographically random passwords, with a configurable length and alphabet
- `token`: cryptographically random tokens in `hex`, `base64`, or `base64url`
- `uuid`: random UUID v4
- `hash`: file digests (`sha256`, `sha384`, `sha512`, or any hash Node.js supports), streamed so large files are fine
- `json`: format, minify, or validate JSON from a file or stdin, with line and column for errors
- `jwt`: decode a JWT locally and show its header, payload, and readable expiry times
- `config`: show, locate, and create config files, with the source of every value
- `--json` on every command, for scripts and agents
- per-command help that shows the settings currently in use and where they come from
- built on Node.js built-ins only, no third-party crypto code, and tokens never leave your machine

## Requirements

- Node.js 22+
- pnpm (only for development)
- macOS, Linux, or Windows

## Install

```bash
npm install -g mydevkit
```

or, for local development:

```bash
git clone https://github.com/psandis/mydevkit.git
cd mydevkit
pnpm install
pnpm build
pnpm link --global
mydk --help
```

(Running from a clone without linking? Use `pnpm dev <command>` in place of `mydk <command>`.)

## Quick Start

```bash
mydk pass                      # 20-character password
mydk pass 32                   # 32-character password
mydk token                     # 32 random bytes as hex
mydk token 32 -e base64url     # URL-safe token
mydk uuid                      # UUID v4
mydk hash file.zip             # sha256 of a file
mydk json data.json            # pretty-print and validate JSON
cat data.json | mydk json -m   # minify JSON from stdin
mydk jwt "$TOKEN"              # decode a JWT
mydk uuid --json               # any command as JSON
mydk help pass                 # help for one command
mydk config show               # settings in use and where they come from
```

## CLI

### Generate a password

```
$ mydk pass
H@3M$1bN+9LwA-PL-LuS

$ mydk pass 32
H!#X#$a-4U20_C^#rnY#5dRRJj+p*^*v

$ mydk pass 16 --alphabet abcdef0123456789
8cfb58476639c54f
```

| Argument / option | Description | Default |
|---|---|---|
| `[length]` | Number of characters, 1 to `limits.maxSize` | `pass.length` (20) |
| `-a, --alphabet <chars>` | Characters to draw from, at least 2 different | `pass.alphabet` |

The default alphabet is `A-Z a-z 0-9 !@#$%^&*_-+=`. Each character is drawn independently and uniformly, so a specific character class (for example a digit) is not guaranteed to appear in a short password.

### Generate a token

```
$ mydk token
4d5089ac8f5ddec9ff312a08cad0e7aa1eca0c4a167808561d2d7465511590a7

$ mydk token 16
dbc6995e66b40f61e205f878164b80d2

$ mydk token 32 --encoding base64
NstzIYOD/ZF2rOkWKR+Vi5sjOziWHldKMOTlDVtr7AA=

$ mydk token 32 --encoding base64url
7Vux6JIziHhWBLgaWMW5-nPfRZ1F7qTTL6nO23Dq9K0
```

| Argument / option | Description | Default |
|---|---|---|
| `[bytes]` | Number of random bytes, 1 to `limits.maxSize` | `token.bytes` (32) |
| `-e, --encoding <encoding>` | `hex`, `base64`, or `base64url` | `token.encoding` (`hex`) |

Length is in bytes, not characters: 32 bytes is 64 hex characters or 43 base64url characters.

### Generate a UUID

```
$ mydk uuid
4c74db8b-d9d3-4ea3-a785-07be1faee1f8
```

### Hash a file

```
$ mydk hash file.txt
ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad

$ mydk hash sha512 file.txt
ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f

$ mydk hash -a sha384 file.txt
cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7
```

| Argument / option | Description | Default |
|---|---|---|
| `[algorithm]` | Hash algorithm, optional, must be in `hash.algorithms` | `hash.algorithm` (`sha256`) |
| `<file>` | File to hash | |
| `-a, --algorithm <name>` | Same as the `[algorithm]` argument | `hash.algorithm` |

Files are read as a stream, so file size does not affect memory use. Verify a download by comparing the output with the published checksum.

### Format and validate JSON

```
$ mydk json package-info.json
{
  "name": "mydevkit",
  "version": "0.3.0",
  "bin": {
    "mydk": "dist/cli/index.js"
  },
  "keywords": [
    "cli",
    "json"
  ]
}

$ mydk json package-info.json --minify
{"name":"mydevkit","version":"0.3.0","bin":{"mydk":"dist/cli/index.js"},"keywords":["cli","json"]}

$ mydk json package-info.json --check
Valid JSON (package-info.json)

$ echo '[1, 2, 3]' | mydk json --minify
[1,2,3]
```

| Argument / option | Description | Default |
|---|---|---|
| `[file]` | JSON file. Leave it out or use `-` to read stdin | stdin |
| `-m, --minify` | Print on one line without whitespace | |
| `-i, --indent <spaces>` | Spaces per level, 1 to 10 | `json.indent` (2) |
| `-c, --check` | Only validate, do not print the document | |

Invalid JSON exits with code 1 and points to the line and column of the problem:

```
$ mydk json broken.json
mydk: Invalid JSON in broken.json: line 4, column 3: Expected ',' or '}' after property value

$ echo '{"a":' | mydk json
mydk: Invalid JSON in stdin: Unexpected end of JSON input
```

Pipe API responses straight in:

```bash
curl -s https://api.github.com/repos/psandis/mydevkit | mydk json
```

### Decode a JWT

```
$ mydk jwt "$TOKEN"
Header
{
  "alg": "RS256",
  "typ": "JWT"
}

Payload
{
  "sub": "user-42",
  "iss": "https://auth.example.com",
  "iat": 1760180400,
  "nbf": 1760180400,
  "exp": 1760184000
}

Times
  iat  2025-10-11T11:00:00.000Z  (issued 1y 4h ago)
  nbf  2025-10-11T11:00:00.000Z  (valid since 1y 4h ago)
  exp  2025-10-11T12:00:00.000Z  (expired 1y 3h ago)

Signature: present, NOT verified
```

| Argument | Description |
|---|---|
| `[token]` | The JWT. Leave it out or use `-` to read stdin. A `Bearer ` prefix is ignored, so you can paste an `Authorization` header value |

- `iat`, `nbf`, and `exp` are shown as UTC dates with a relative time, so an expired token is obvious at a glance.
- The token is decoded locally and never sent anywhere, unlike pasting it into a website.
- **The signature is not verified.** mydk only decodes. Never trust a decoded token in your application without verifying it with the issuer's key.
- Encrypted tokens (JWE, 5 parts) cannot be decoded without the key and are rejected with a clear message.

```
$ mydk jwt not-a-token
mydk: Not a JWT: expected 3 parts separated by dots.
```

### JSON output for scripts

Add `--json` to any command to get structured output. It works before or after the command name:

```
$ mydk pass --json
{
  "password": "5QXFgvuFu9_=0nYazF%G",
  "length": 20
}

$ mydk token 16 --json
{
  "token": "8662038ced74db6f893bd8c5e3e3496b",
  "bytes": 16,
  "encoding": "hex"
}

$ mydk uuid --json
{
  "uuid": "2c866c54-9ffd-4cdd-b0c7-487be965a53d"
}

$ mydk hash file.txt --json
{
  "file": "file.txt",
  "algorithm": "sha256",
  "hash": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
}
```

`mydk jwt --json` returns the header, payload, times, an `expired` flag (`null` without `exp`), and `"signatureVerified": false`:

```
$ mydk jwt "$TOKEN" --json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "1234567890",
    "name": "John Doe",
    "iat": 1516239022
  },
  "times": {
    "iat": {
      "value": 1516239022,
      "date": "2018-01-18T01:30:22.000Z",
      "note": "issued 8y 268d ago"
    }
  },
  "expired": null,
  "signed": true,
  "signatureVerified": false
}
```

With `--json`, errors are also JSON, on stderr, with the exit code:

```
$ mydk pass 0 --json
{"error":"Length must be an integer between 1 and 4096.","exitCode":1}
```

Combine with [jq](https://jqlang.org):

```bash
mydk jwt "$TOKEN" --json | jq -r .payload.sub
mydk hash release.zip --json | jq -r .hash
```

### Get help

Every command has its own help, which also shows the settings currently in use and which file each one comes from:

```
$ mydk help pass
Usage: mydk pass [options] [length]

Generate a cryptographically random password

Arguments:
  length                  number of characters (default: pass.length)

Options:
  -a, --alphabet <chars>  characters to draw from (default: pass.alphabet)
  -h, --help              Show help

Global Options:
  -v, --version           Show version
  --json                  print results and errors as JSON

Current settings:
  length    20  (pass.length, from built-in default)
  alphabet  ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*_-+=  (pass.alphabet, from built-in default)

Each character is drawn independently, so a specific character class is not
guaranteed to appear.

Examples:
  mydk pass
  mydk pass 32
  mydk pass 16 --alphabet "abcdef0123456789"
  mydk pass --json
```

`mydk help <command>` and `mydk <command> --help` are the same. Mistyped commands get a suggestion:

```
$ mydk tokn
mydk: unknown command 'tokn'
(Did you mean token?)
```

## Configuration

All defaults live in [`data/defaults.json`](data/defaults.json). Override any of them in a config file instead of passing flags every time.

### Config files

| Scope | Path | Use it for |
|---|---|---|
| User | `~/.mydk/config.json` | Your personal defaults on this machine |
| Project | `.mydk.json` in the current directory | Settings for one project, can be committed with it |

`~` is your home directory: `/Users/<you>` on macOS, `/home/<you>` on Linux, `C:\Users\<you>` on Windows.

Values are merged in this order, later ones win:

1. built-in defaults (`data/defaults.json`)
2. user config (`~/.mydk/config.json`)
3. project config (`./.mydk.json`)
4. command-line arguments and flags

A config file only needs the keys you want to change.

### Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `pass.length` | integer | `20` | Default password length |
| `pass.alphabet` | string | `A-Z a-z 0-9 !@#$%^&*_-+=` | Characters passwords are drawn from |
| `token.bytes` | integer | `32` | Default number of random bytes |
| `token.encoding` | string | `hex` | `hex`, `base64`, or `base64url` |
| `hash.algorithm` | string | `sha256` | Default hash algorithm, must be in `hash.algorithms` |
| `hash.algorithms` | string[] | `["sha256", "sha384", "sha512"]` | Allowed algorithms, any name from Node.js `crypto.getHashes()` (for example `sha3-256`, `blake2b512`) |
| `json.indent` | integer | `2` | Spaces per level for `mydk json` and `mydk jwt`, 1 to 10 |
| `limits.maxSize` | integer | `4096` | Upper limit for password length and token bytes |

### Example

`~/.mydk/config.json`:

```json
{
  "pass": { "length": 32 },
  "token": { "encoding": "base64url" }
}
```

`~/my-project/.mydk.json`:

```json
{
  "pass": { "alphabet": "abcdefghjkmnpqrstuvwxyz23456789" },
  "hash": { "algorithm": "sha512" }
}
```

Result, run inside `~/my-project`:

```
$ mydk config show
pass.length      32  (~/.mydk/config.json)
pass.alphabet    abcdefghjkmnpqrstuvwxyz23456789  (~/my-project/.mydk.json)
token.bytes      32  (built-in default)
token.encoding   base64url  (~/.mydk/config.json)
hash.algorithm   sha512  (~/my-project/.mydk.json)
hash.algorithms  sha256, sha384, sha512  (built-in default)
json.indent      2  (built-in default)
limits.maxSize   4096  (built-in default)

$ mydk pass
ayspaesx7b7a79uaru9a3eh6x56pc4ag

$ mydk token
YnxDTNETvmmSqfjyTH8_2zNutZ7DmvMe-89Iunn53Bg
```

### Config commands

```
$ mydk config init
Wrote ~/.mydk/config.json

$ mydk config path
user     ~/.mydk/config.json  (found)
project  ~/my-project/.mydk.json  (found)
```

| Command | Description |
|---|---|
| `mydk config show` | Print every setting, its value, and where it comes from |
| `mydk config show --json` | Print the merged config as JSON |
| `mydk config path` | List the config files mydk reads, in merge order |
| `mydk config init` | Write `~/.mydk/config.json` with the built-in defaults |
| `mydk config init --project` | Write `./.mydk.json` instead |
| `mydk config init --force` | Overwrite an existing file |

### Validation

Config files are validated on every run. Unknown keys (usually typos) and invalid values are rejected with the file name, and nothing is generated:

```
$ mydk pass
mydk: ~/my-project/.mydk.json: unknown key "pass.lenght".

$ mydk pass
mydk: ~/my-project/.mydk.json: "pass.length" must be an integer between 1 and 4096.
```

Help still works with a broken config file, so you can always run `mydk help`.

## Storage

mydk stores nothing on its own. It reads the two config files above and the files you pass to `hash` and `json`, and the only command that writes is `mydk config init`. Generated passwords and tokens are printed to stdout and never saved. mydk makes no network requests, so JSON and JWTs you decode never leave your machine.

## Exit Codes

Results go to stdout and errors to stderr, so output can be piped or captured safely:

```bash
export API_TOKEN=$(mydk token)
mydk pass 24 | pbcopy            # macOS
mydk pass 24 | xclip -sel clip   # Linux
mydk pass 24 | clip              # Windows
```

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Invalid arguments, unknown command, invalid input (bad JSON or JWT), or runtime error (for example a missing file) |
| `2` | Invalid config file |

```
$ mydk pass 5000
mydk: Length must be an integer between 1 and 4096.

$ mydk hash md5 file.zip
mydk: Supported algorithms: sha256, sha384, sha512.

$ mydk hash missing.zip
mydk: ENOENT: no such file or directory, open 'missing.zip'
```

## Testing

```bash
pnpm test         # vitest
pnpm check        # biome lint and format check
pnpm typecheck    # tsc on src and tests
```

Tests run against temporary home and project directories, so they never read or change your real config files.

## Tech Stack

TypeScript, [Commander](https://github.com/tj/commander.js), Node.js built-ins (`node:crypto`, `node:fs`), Vitest, Biome, pnpm.

## Related

- [nscout](https://github.com/psandis/nscout): Scout a name across npm, GitHub, PyPI, and domain registries
- [portmind](https://github.com/psandis/portmind): Scan listening ports and remember what normally runs where
- [dustclaw](https://github.com/psandis/dustclaw): Find out what is eating your disk space
- [dietclaw](https://github.com/psandis/dietclaw): Codebase health monitor

## License

See [MIT](LICENSE)

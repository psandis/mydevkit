# mydevkit

[![npm version](https://img.shields.io/npm/v/mydk.svg)](https://www.npmjs.com/package/mydk)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A small collection of everyday developer tools in one command. Generate passwords, tokens, and UUIDs, or hash a file, without reaching for a website or a one-off script. Every default is configurable through a JSON config file. The npm package and CLI command are named **mydk**.

## What It Does

- `pass`: cryptographically random passwords, with a configurable length and alphabet
- `token`: cryptographically random tokens in `hex`, `base64`, or `base64url`
- `uuid`: random UUID v4
- `hash`: file digests (`sha256`, `sha384`, `sha512`, or any hash Node.js supports), streamed so large files are fine
- `config`: show, locate, and create config files, with the source of every value
- per-command help that shows the settings currently in use and where they come from
- built on Node.js `node:crypto` only, no third-party crypto code

## Requirements

- Node.js 22+
- pnpm (only for development)
- macOS, Linux, or Windows

## Install

```bash
npm install -g mydk
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

Current settings:
  length    20  (pass.length, from built-in default)
  alphabet  ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*_-+=  (pass.alphabet, from built-in default)

Each character is drawn independently, so a specific character class is not
guaranteed to appear.

Examples:
  mydk pass
  mydk pass 32
  mydk pass 16 --alphabet "abcdef0123456789"
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

mydk stores nothing on its own. The only files it reads are the two config files above, and the only command that writes is `mydk config init`. Generated passwords and tokens are printed to stdout and never saved or sent anywhere.

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
| `1` | Invalid arguments, unknown command, or runtime error (for example a missing file) |
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
pnpm typecheck    # tsc --noEmit
```

Tests run against temporary home and project directories, so they never read or change your real config files.

## Tech Stack

TypeScript, [Commander](https://github.com/tj/commander.js), Node.js `node:crypto`, Vitest, Biome, pnpm.

## Related

- [nscout](https://github.com/psandis/nscout): Scout a name across npm, GitHub, PyPI, and domain registries
- [portmind](https://github.com/psandis/portmind): Scan listening ports and remember what normally runs where
- [dustclaw](https://github.com/psandis/dustclaw): Find out what is eating your disk space
- [dietclaw](https://github.com/psandis/dietclaw): Codebase health monitor

## License

See [MIT](LICENSE)

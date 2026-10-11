import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/program.js";

export interface Sandbox {
  home: string;
  cwd: string;
  writeUserConfig: (config: unknown) => void;
  writeProjectConfig: (config: unknown) => void;
  cleanup: () => void;
}

/** Temporary home and working directories, so tests never read real config files. */
export function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "mydk-test-"));
  const home = join(root, "home");
  const cwd = join(root, "project");
  mkdirSync(home);
  mkdirSync(cwd);
  return {
    home,
    cwd,
    writeUserConfig: (config) => {
      mkdirSync(join(home, ".mydk"), { recursive: true });
      writeFileSync(join(home, ".mydk", "config.json"), JSON.stringify(config));
    },
    writeProjectConfig: (config) => {
      writeFileSync(join(cwd, ".mydk.json"), JSON.stringify(config));
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export async function cli(box: Sandbox, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    home: box.home,
    cwd: box.cwd,
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr, line: stdout.trim() };
}

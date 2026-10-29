import type { AccountsCommandIo } from "../types.ts";

export type CliTestIo = AccountsCommandIo & { out: string[]; err: string[] };

/** An in-memory command-line I/O: stdout and stderr are captured; stdin and files are given. */
export function cliTestIo(options: { stdin?: string; files?: Record<string, string>; env?: Record<string, string> } = {}): CliTestIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    readStdin: async () => options.stdin ?? "",
    readFile: async (path) => {
      const content = options.files?.[path];
      if (content === undefined) throw new Error("no such file");
      return content;
    },
    env: options.env ?? {}
  };
}

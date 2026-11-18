/** A command line, parsed: the command and its flags. */
export type CloudArguments = {
  command: "up" | "down" | "status" | "smoke" | "render" | "schema" | "help";
  config: string;
  profile: string | null;
  out: string | null;
  build: boolean;
  keepData: boolean;
  keepImages: boolean;
  json: boolean;
};

const COMMANDS = new Set(["up", "down", "status", "smoke", "render", "schema", "help"]);
const VALUE_FLAGS = new Set(["--config", "--profile", "--out"]);
const SWITCHES = new Set(["--build", "--keep-data", "--keep-images", "--json", "--help"]);

/** Parses `fluxiq-cloud <command> [flags]`; an unknown command or flag throws with the one that was wrong. */
export function parseArguments(argv: readonly string[]): CloudArguments {
  const parsed: CloudArguments = { command: "help", config: "fluxiq-cloud.config.json", profile: null, out: null, build: false, keepData: false, keepImages: false, json: false };
  const [command, ...rest] = argv;
  if (command !== undefined && command !== "--help" && command !== "-h") {
    if (!COMMANDS.has(command)) throw new Error(`Unknown command "${command}". Commands: up, down, status, smoke, render, schema, help.`);
    parsed.command = command as CloudArguments["command"];
  }
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index] ?? "";
    const [name = "", inline] = flag.includes("=") ? [flag.slice(0, flag.indexOf("=")), flag.slice(flag.indexOf("=") + 1)] : [flag, undefined];
    if (VALUE_FLAGS.has(name)) {
      const value = inline ?? rest[++index];
      if (value === undefined || value === "") throw new Error(`${name} needs a value.`);
      if (name === "--config") parsed.config = value;
      else if (name === "--profile") parsed.profile = value;
      else parsed.out = value;
    } else if (SWITCHES.has(name) && inline === undefined) {
      if (name === "--build") parsed.build = true;
      else if (name === "--keep-data") parsed.keepData = true;
      else if (name === "--keep-images") parsed.keepImages = true;
      else if (name === "--json") parsed.json = true;
      else parsed.command = "help";
    } else throw new Error(`Unknown flag "${flag}" for ${parsed.command}.`);
  }
  if (parsed.command === "render" && parsed.out === null) throw new Error("render needs --out <dir>: the folder the files are written to.");
  return parsed;
}

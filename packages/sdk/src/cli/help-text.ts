// What `fluxiq help` prints.

export const HELP_TEXT = `fluxiq: the FluxIQ SDK's command line

  fluxiq init                          Create ~/.fluxiq with an owner key pair (nothing is written into the project)
  fluxiq dev [flags]                   Start the local engine (runs the engine package's own \`fluxiq dev\`)
  fluxiq runs [--name n] [--state s]   List runs, newest first
  fluxiq inspect <runId> [--events]    Show one run: state, result, and with --events its events
  fluxiq pin <name> [--proposal id] [--out file]
                                       Pin a FluxNode's learned Flow (or adopt a held proposal) and write it to fluxiq/pinned/<name>.flow.json
  fluxiq learn <module> --samples f    Run a FluxNode over sample inputs before deployment

Flags for every command that calls the engine: --url <address>, --profile <name>, --json.
The key is found the way FluxIQ.connect() finds it: FLUXIQ_KEY, FLUXIQ_KEY_FILE, FLUXIQ_KEY_PROFILE,
then the [default] profile in ~/.fluxiq/credentials, otherwise no key (a local engine in open mode).
`;

/** What `fluxiq-cloud help` prints. */
export const HELP_TEXT = `fluxiq-cloud: build and tear down the whole FluxIQ cloud platform from one config file.

Usage: fluxiq-cloud <command> [--config <file>] [flags]

Commands
  up        Build Core's image if missing, generate absent secrets, and start every
            service (Core, Caddy, and on the local profile Mailpit and, for a service,
            stripe-mock).
            --build rebuilds the image even when it exists.
  down      Remove everything the deployment created: containers, networks, volumes,
            images and generated files, found by the label com.fluxiq.cloud.project
            and the state file. Safe to repeat.
            --keep-data keeps the volumes, their secrets and the state (a restart).
            --keep-images keeps the built and pulled images.
  status    Each service's state, health and ports, and the URLs. --json for JSON.
  smoke     The end-to-end check of a local rehearsal. A service (mode "service"):
            two sign-ups, their emails, TLS sign-in, workspace isolation, the payments
            API and billing webhook, a restart, and a final down. A self-hosted server
            (mode "self-hosted"): health, readiness, discovery, no billing, a restart,
            and a final down.
  render    Validate the config and write the files a server would run, without
            deploying: --out <dir> (required), --profile <local|production> to
            check the config is the one you mean.
  schema    Print the config's JSON Schema.

The config defaults to ./fluxiq-cloud.config.json. Examples ship in the package's
examples/ folder; docs/architecture/cloud-platform.md is the guide.
`;

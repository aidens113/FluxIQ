# @fluxiq/cloud

Build and tear down the whole FluxIQ cloud platform from one config file.

```sh
fluxiq-cloud up --config fluxiq-cloud.config.json
fluxiq-cloud status
fluxiq-cloud smoke
fluxiq-cloud down
fluxiq-cloud render --profile production --config production.config.json --out ./bundle
```

Start from `examples/local.config.json` (a rehearsal on this machine:
`app.fluxiq.localhost`, Caddy's local certificate authority, Mailpit and
stripe-mock) or `examples/production.config.json` (a real server: ACME, an
SMTP relay, Stripe). Both deploy the same files; only values differ.
`fluxiq-cloud schema` prints the config's JSON Schema, also shipped as
`fluxiq-cloud.schema.json`.

The guide is `docs/architecture/cloud-platform.md` in the FluxIQ Core
repository.

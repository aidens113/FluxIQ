/**
 * The JSON Schema of `fluxiq-cloud.config.json`. It is the one source of the
 * file's shape: `checkAgainstSchema` validates with it, and the shipped
 * `fluxiq-cloud.schema.json` (for editors) is this object, which a test keeps
 * equal. Rules that compare fields (what each profile allows) are in
 * `checkProfileRules`, because they read better as code than as schema.
 */
export const CLOUD_CONFIG_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://getfluxiq.com/schemas/fluxiq-cloud.config.json",
  title: "fluxiq-cloud.config.json",
  description: "One FluxIQ cloud deployment: what `fluxiq-cloud up` builds and `down` removes. A local rehearsal and the real server use the same files; only these values differ.",
  type: "object",
  additionalProperties: false,
  required: ["project", "profile", "driver", "source", "domain", "tls", "instance", "gateway", "email"],
  properties: {
    $schema: { type: "string", description: "The schema this file follows (for editors)." },
    project: { type: "string", pattern: "^[a-z][a-z0-9-]{1,30}[a-z0-9]$", description: "The deployment's name: the Compose project, the prefix of every network and volume, and the value of the label com.fluxiq.cloud.project that `down` removes by." },
    profile: { enum: ["local", "production"], description: "local: a rehearsal on this machine (local certificate authority, Mailpit, stripe-mock). production: a real server with a domain (ACME, a real SMTP relay, Stripe)." },
    mode: { enum: ["service", "self-hosted"], description: "service (default): the hosted multi-user service, with billing, the provisioning listener and sign-up. self-hosted: one company's own server with the full base product and no billing, provisioning or payments." },
    driver: { enum: ["local-docker", "vm", "aws", "gcp", "azure"], description: "local-docker runs Docker Compose on the machine `fluxiq-cloud` runs on (a laptop or the real server). The others are not built yet and refuse." },
    source: {
      type: "object", additionalProperties: false, required: ["root"],
      properties: { root: { type: "string", minLength: 1, description: "The FluxIQ Core checkout whose deploy/ (Dockerfile, compose file, Caddyfile) is used, relative to this file or absolute." } }
    },
    stateDir: { type: "string", minLength: 1, description: "Where the deployment's state, rendered files and generated secrets live (default .fluxiq/cloud beside this file); the project gets its own folder inside." },
    domain: { type: "string", pattern: "^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$", description: "The panel's host name, e.g. app.fluxiq.localhost locally or app.example.org on a server." },
    ports: {
      type: "object", additionalProperties: false,
      properties: {
        http: { type: "integer", minimum: 1, maximum: 65535, description: "The host port Caddy's HTTP listens on (default 80)." },
        https: { type: "integer", minimum: 1, maximum: 65535, description: "The host port Caddy's HTTPS listens on (default 443)." }
      }
    },
    tls: {
      type: "object", additionalProperties: false, required: ["mode", "email"],
      properties: {
        mode: { enum: ["internal", "acme"], description: "internal: Caddy's own local certificate authority (local profile). acme: a public certificate from Let's Encrypt (production)." },
        email: { type: "string", pattern: "^[^\\s@<>]+@[^\\s@<>]+$", description: "The operator's address for the certificate authority's notices." },
        trustLocalCa: { type: "boolean", description: "Local only, off by default: add Caddy's local root certificate to the current Windows user's trust store (never the machine store); `down` removes it. With it off, clients pin the exported certificate." }
      }
    },
    instance: {
      type: "object", additionalProperties: false, required: ["id"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", description: "FLUXIQ_INSTANCE_ID: stable across restarts." },
        name: { type: "string", minLength: 1, maxLength: 80, description: "The name the extension shows for this server." }
      }
    },
    signUpUrl: { type: "string", pattern: "^https://", description: "Where the extension sends someone with no account yet." },
    signup: { enum: ["off", "open"], description: "Service only (default off): whether anyone may create their own account (FLUXIQ_SIGNUP); off leaves account creation to the provisioning listener." },
    gateway: {
      type: "object", additionalProperties: false, required: ["allowedOrigins"],
      properties: {
        allowedOrigins: { type: "array", minItems: 1, items: { type: "string", pattern: "^(chrome-extension|moz-extension)://[A-Za-z0-9*-]+$" }, description: "The extension origins the client gateway admits." }
      }
    },
    provisioning: {
      type: "object", additionalProperties: false,
      properties: {
        subnet: { type: "string", pattern: "^\\d{1,3}(\\.\\d{1,3}){3}/\\d{1,2}$", description: "The internal provisioning network's subnet (default 172.31.250.0/24)." },
        address: { type: "string", pattern: "^\\d{1,3}(\\.\\d{1,3}){3}$", description: "Core's address on it, where the listener binds (default 172.31.250.10)." }
      }
    },
    email: {
      type: "object", additionalProperties: false, required: ["from", "smtp"],
      properties: {
        from: { type: "string", minLength: 3, description: "The From address of account email, `Name <address>` or a bare address." },
        smtp: { type: "string", pattern: "^(smtp|smtps|smtp\\+starttls)://[^/@\\s]+$", description: "smtp://mailpit:1025 for the local sink; smtp+starttls://host:587 or smtps://host:465 for a real relay." },
        username: { type: "string", minLength: 1, description: "The relay's sign-in name, with passwordFile." },
        passwordFile: { type: "string", minLength: 1, description: "A file holding the relay's password, relative to this file or absolute. Mounted as a secret, never copied." }
      }
    },
    payments: {
      type: "object", additionalProperties: false, required: ["apiBase"],
      description: "Service only, and required there: the payments API and the files holding its keys.",
      properties: {
        apiBase: { type: "string", pattern: "^https?://[^\\s]+$", description: "Stripe's API: http://stripe-mock:12111 locally, https://api.stripe.com on a server." },
        secretKeyFile: { type: "string", minLength: 1, description: "A file holding the Stripe secret key (test or live), relative to this file or absolute. Generated for stripe-mock when absent locally." },
        webhookSecretFile: { type: "string", minLength: 1, description: "A file holding the webhook signing secret Stripe gives this endpoint (whsec_...), relative to this file or absolute. Required with billing on a server; generated while the stripe-mock sink runs." }
      }
    },
    billing: {
      type: "object", additionalProperties: false, required: ["provider", "allowTrial", "graceMs", "retentionMs", "refreshAfterMs", "plans"],
      description: "Service only. What the deployment sells and how long coverage outlasts payment. Rendered as Core's commerce configuration (FLUXIQ_COMMERCE_CONFIG_FILE); absent, the deployment bills nothing.",
      properties: {
        provider: { enum: ["stripe", "fake"], description: "stripe: Stripe (or stripe-mock locally). fake: Core's in-memory test provider, local profile only." },
        allowTrial: { type: "boolean", description: "Whether a trialing subscription admits new work." },
        graceMs: { type: "integer", minimum: 0, description: "How long after paid coverage ended unpaid new work is still admitted (past due inside grace); 0 admits none." },
        retentionMs: { type: "integer", minimum: 0, description: "How long a lapsed account's data is kept." },
        refreshAfterMs: { type: "integer", minimum: 1, description: "A subscription not verified for this long is re-fetched from the provider." },
        maxVerificationAgeMs: { type: "integer", minimum: 1, description: "How old a verification cloud admission still trusts; must exceed refreshAfterMs. Default twice refreshAfterMs." },
        plans: {
          type: "object",
          description: "The plans sold, by plan id.",
          additionalProperties: {
            type: "object", additionalProperties: false, required: ["priceId", "grants"],
            properties: {
              priceId: { type: "string", minLength: 1, description: "The provider price the plan is sold as." },
              unit: { enum: ["dedicated-browser", "seat", "flat"], description: "What this price counts, the Stripe item quantity being the count: dedicated-browser (a dedicated browser each), seat (a team seat each) or flat (default: one price for the whole plan)." },
              grants: {
                type: "array", minItems: 1,
                description: "What the plan grants.",
                items: {
                  type: "object", additionalProperties: false, required: ["key", "allocation", "capabilities"],
                  properties: {
                    key: { type: "string", minLength: 1, description: "The entitlement key." },
                    allocation: { enum: ["control", "shared", "dedicated"], description: "The allocation class." },
                    capabilities: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "The capabilities granted." },
                    regions: { type: "array", items: { type: "string", minLength: 1 }, description: "Where the grant applies; required unless the allocation is control." }
                  }
                }
              }
            }
          }
        }
      }
    },
    sinks: {
      type: "object", additionalProperties: false,
      properties: {
        mail: { type: "boolean", description: "Run Mailpit as the mail sink (local only)." },
        payments: { type: "boolean", description: "Run stripe/stripe-mock as the payments API (local only)." },
        mailUiPort: { type: "integer", minimum: 1, maximum: 65535, description: "The loopback port of Mailpit's web view and API (default 8025)." }
      }
    },
    secrets: {
      type: "object", additionalProperties: false,
      properties: { dir: { type: "string", minLength: 1, description: "Where the provisioning token, setup code and keyring files live; generated there when absent (default <state>/secrets)." } }
    },
    images: {
      type: "object", additionalProperties: false,
      properties: {
        core: { type: "string", pattern: "^[a-z0-9][a-z0-9._/-]*$", description: "The repository Core's image is tagged in (default fluxiq-cloud/core); the tag is the package version." },
        caddy: { type: "string", minLength: 1 },
        mailpit: { type: "string", minLength: 1 },
        stripeMock: { type: "string", minLength: 1 }
      }
    }
  }
} as const;

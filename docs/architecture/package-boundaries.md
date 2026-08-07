# Package Boundaries And Distribution

FluxIQ has three public ESM packages. They are compiled before use; consumers
must not depend on repository TypeScript sources, workspace aliases, or a
TypeScript runtime loader.

| Package | Owns | Environment | Runtime dependencies |
| --- | --- | --- | --- |
| `@fluxiq/contracts` | JSON primitives, program API schemas, client-gateway protocol, and external Automation Studio recording contracts | Browser and Node.js | `zod` |
| `fluxiq` | Domain-neutral framework runtime, global programs, storage, migrations, and host integration | Node.js 22 or newer | contracts, QR generation, and native SQLite |
| `@fluxiq/client-gateway-websocket` | WebSocket transport and browser-facing client helpers | Browser and Node.js 22 or newer | contracts only |

The contracts package is the dependency seam between browser clients and the
framework. It must not import the runtime. The WebSocket client must not pull
in `fluxiq`, SQLite, TypeDoc, QR generation, React, or Node filesystem modules.
The runtime preserves its existing contract-related exports as compatibility
re-exports, so current importing repositories do not have to change all imports
at once.

## Domain Ownership

These packages are domain-neutral. An importing repository defines its domain
manifest, program root, names, labels, adapters, and private assets. Framework
terms such as "global editor" describe shared ownership and persistence scope;
the imported UI still uses the active importer's domain manifest for visible
naming and branding.

## Exports And Builds

All packages are ESM-only and expose conditional `types` and `import` entries
from `dist/`. Relative source imports use TypeScript extensions during local
development and are rewritten to JavaScript extensions in emitted code and
declarations. Package tarballs include only compiled output and a package
README.

The runtime keeps its established public subpaths during the 0.1 compatibility
period. New subpaths should be added only for an independently useful surface;
internal folders are not automatically public API.

TypeDoc is an optional runtime peer. Repository development installs it to
generate API reference, while normal runtime import and setup work without it.
Native `sqlite3` remains external and is installed for the consumer platform.

## Validation And Release Policy

Run the complete distribution gate with:

```bash
pnpm package:validate
```

It builds the packages, checks their manifests and type resolution, packs local
tarballs, rejects source/private files, installs clean Node and browser
consumers, imports every runtime export, performs global/domain SQLite writes,
exercises a layout-v1 to layout-v2 migration, type-checks without workspace
paths, and browser-bundles the WebSocket client while checking its dependency
graph. CI repeats the checks on Node 22 for Windows and Linux.

All public packages currently share version `0.1.0`. Before 1.0, compatible
changes increment the patch version and intentional API breaks increment the
minor version with migration notes. Registry publication, tags, signing, and
provenance are separate release actions and are not performed by validation.

All public packages carry the repository's source-available FluxIQ license and
include an exact copy in their tarball. Commercial use outside the community
terms is available only through a separate written agreement. Registry
publication, tags, signing, provenance, the final legal licensor identity, and
commercial contract templates remain separate owner-controlled release work.

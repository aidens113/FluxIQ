# fluxiq

The domain-neutral FluxIQ framework runtime for Node.js 22 and newer.

```ts
import { FluxIQ } from "fluxiq";

const fluxiq = FluxIQ.create({ rootDir: process.cwd() });
await fluxiq.setup();
```

Fresh setup creates only `.fluxiq/config.json`. Framework state is created
lazily in the importing repository. Importer-owned domain manifests provide
the names, labels, recording contracts, and extensions used by FluxIQ.

The package is native ESM. TypeDoc is optional and is needed only when invoking
the TypeDoc-backed documentation generator.

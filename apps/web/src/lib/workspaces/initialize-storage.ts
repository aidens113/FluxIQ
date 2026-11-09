// Readying an instance's storage lives in Core (`fluxiq/server`), so a server
// without Next.js readies it exactly as the web runtime does.
export { initializeFluxIQServerStorage as initializeFluxIQWebStorage } from "fluxiq/server";

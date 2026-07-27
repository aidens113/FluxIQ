import { FluxIQ } from "fluxiq";

let instance: FluxIQ | null = null;

export function getFluxIQ(): FluxIQ {
  instance ??= FluxIQ.create();
  return instance;
}

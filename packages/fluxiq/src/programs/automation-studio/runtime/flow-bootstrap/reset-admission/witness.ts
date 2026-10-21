// What a reversible lasting act is witnessed by (t751, R3): something Core
// reads whose reading from before the act it holds, so that a later fresh read
// can show the act put back. The one admission (`./admission.ts`) answers one
// of these for every reversible scoped press it admits:
//
// - `destination`: a list named for the act by an issued ref (or, for an
//   identified creation, its own scope), an original of its resource with the
//   creation's subject absent;
// - `own_list`: the list its control sits in, read complete as an original of
//   its resource;
// - `control`: its own control's place, where the press declares exactly
//   `modify_existing` and the control states its state there; a project also
//   requires original counts read before the build acted, retained by a Core receipt;
// - `repeats`: a witnessed act this build explored, which it repeats and
//   whose witnesses it shares;
// - `legacy`: explicit standalone exploration of an unscoped press (no subject,
//   page or scope), which keeps its compatibility policy. Projects refuse it.
//
// `scope`, `group` and `place` are the domain's opaque tokens: Core compares
// them, and they never leave Core. A plan node carries only the stamp, the
// JSON-safe form with nothing opaque in it (`./stamp-valid.ts` validates it).

/** What a reversible lasting act is witnessed by (header). */
export type AutomationStudioSiteResetWitness =
  | { via: "destination"; ref: string; scope: string; group: string }
  | { via: "own_list"; scope: string; group: string }
  | { via: "control"; place: string }
  | { via: "repeats"; act: string }
  | { via: "legacy" };

/** A witness as a plan node carries it: `via`, and a Core receipt ref or act id, never a domain identity. Projects require a control receipt; bare forms are standalone compatibility only. */
export type AutomationStudioSiteResetWitnessStamp =
  | { via: "destination"; ref: string }
  | { via: "own_list" }
  | { via: "control"; ref?: string }
  | { via: "repeats"; act: string }
  | { via: "legacy" };

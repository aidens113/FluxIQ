// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

/** Every position the draft has, ascending. */
export function existingPositions(steps: readonly { position: number }[]): number[] {
  return steps.map((step) => step.position).filter((position) => Number.isSafeInteger(position));
}

/** The draft's last position, or 0 for a draft with none. */
export function lastPosition(steps: readonly { position: number }[]): number {
  const positions = existingPositions(steps);
  return positions.length ? Math.max(...positions) : 0;
}

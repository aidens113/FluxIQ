const pinnedImage = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/;

/** Deployment digests identify containers; discovery's artifactDigest identifies built JS. */
export function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Release manifest must be an object');
  }
  const allowed = ['schema', 'release', 'profile', 'platform', 'coreImage', 'caddyImage'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('Unknown release manifest field');
  }
  if (value.schema !== 1 || value.platform !== 'linux/amd64') {
    throw new Error('Expected release schema 1 and platform linux/amd64');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value.release ?? '')) {
    throw new Error('Release must be a safe identifier of at most 80 characters');
  }
  if (!['self-hosted', 'service'].includes(value.profile)) {
    throw new Error('A cloud release must select self-hosted or service explicitly');
  }
  for (const key of ['coreImage', 'caddyImage']) {
    if (typeof value[key] !== 'string' || !pinnedImage.test(value[key])) {
      throw new Error(`${key} must be a public registry image pinned by sha256 digest`);
    }
    if (/sha256:([a-f0-9])\1{63}$/.test(value[key])) {
      throw new Error(`${key} contains a placeholder digest`);
    }
  }
  return Object.freeze({ ...value });
}

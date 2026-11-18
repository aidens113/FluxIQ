import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildRelease } from '../build.mjs';
import { validateManifest } from '../validate-manifest.mjs';

const manifest = {
  schema: 1, release: 'test-1.0.0', profile: 'service', platform: 'linux/amd64',
  coreImage: `ghcr.io/example/fluxiq-core@sha256:${'0123456789abcdef'.repeat(4)}`,
  caddyImage: `caddy@sha256:${'abcdef0123456789'.repeat(4)}`,
};

test('rejects mutable releases, credentials, placeholders, unsupported targets and unknown fields', () => {
  for (const changes of [
    { coreImage: 'fluxiq-core:latest' }, { caddyImage: 'user:password@registry.example/image:tag' },
    { coreImage: `fluxiq-core@sha256:${'0'.repeat(64)}` }, { release: '../escape' },
    { profile: 'local' }, { platform: 'linux/arm64' }, { schema: 2 }, { secret: 'not-allowed' },
  ]) assert.throws(() => validateManifest({ ...manifest, ...changes }));
  assert.equal(validateManifest(manifest).coreImage, manifest.coreImage);
});

for (const profile of ['self-hosted', 'service']) {
  test(`${profile} bundle preserves original proxy/network/secret contracts and fixes images and state paths`, async () => {
    const temp = await mkdtemp(resolve(tmpdir(), 'fluxiq-cloud-release-'));
    try {
      const source = resolve(temp, 'manifest.json');
      const output = resolve(temp, 'release');
      await writeFile(source, JSON.stringify({ ...manifest, profile }));
      await buildRelease(source, output);
      const overlay = JSON.parse(await readFile(resolve(output, 'cloud.compose.json'), 'utf8'));
      assert.equal(overlay.services.fluxiq.image, manifest.coreImage);
      assert.equal(overlay.services.caddy.image, manifest.caddyImage);
      assert.equal(overlay.services.fluxiq.volumes[0].source, '/srv/fluxiq/core');
      assert.equal(overlay.services.fluxiq.volumes[0].target, '/data');
      assert.equal(overlay.services.fluxiq.network_mode, undefined);
      assert.equal(overlay.services.fluxiq.ports, undefined);
      const original = await readFile(new URL(`../../../compose/${profile}.compose.yml`, import.meta.url), 'utf8');
      assert.equal(await readFile(resolve(output, `deploy/compose/${profile}.compose.yml`), 'utf8'), original);
      const launch = await readFile(resolve(output, 'launch.sh'), 'utf8');
      assert.match(launch, /up -d --no-build --force-recreate --wait/);
      assert.match(launch, /config --quiet/);
      assert.doesNotMatch(launch, /\beval\b|^\s*source\s/m);
      await assert.rejects(() => buildRelease(source, output), { code: 'EEXIST' });
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}

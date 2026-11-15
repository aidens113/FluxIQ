import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { buildRelease } from '../build.mjs';

const run = promisify(execFile);
const standalone = process.env.FLUXIQ_COMPOSE_TEST_BINARY;
const manifest = {
  schema: 1, release: 'fixture', platform: 'linux/amd64',
  coreImage: `ghcr.io/example/fluxiq-core@sha256:${'0123456789abcdef'.repeat(4)}`,
  caddyImage: `caddy@sha256:${'abcdef0123456789'.repeat(4)}`,
};

for (const profile of ['self-hosted', 'service']) {
  test(`${profile} actual Compose merge preserves private ports, hardened runtime, secrets and retained state`, async (context) => {
    if (!standalone) {
      context.skip('Set FLUXIQ_COMPOSE_TEST_BINARY to a standalone Compose CLI; no engine is required');
      return;
    }
    const temp = await mkdtemp(resolve(tmpdir(), 'fluxiq-compose-contract-'));
    try {
      const source = resolve(temp, 'manifest.json');
      const output = resolve(temp, 'release');
      const secrets = resolve(temp, 'secrets');
      await mkdir(secrets);
      await writeFile(source, JSON.stringify({ ...manifest, profile }));
      await buildRelease(source, output);
      const environment = resolve(temp, 'runtime.env');
      await writeFile(environment, "FLUXIQ_PUBLIC_ORIGIN='https://app.example.org'\nFLUXIQ_SITE_ADDRESS='app.example.org'\nACME_EMAIL='operator@example.org'\nFLUXIQ_INSTANCE_ID='fixture-instance'\nFLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'\n");
      for (const name of ['provisioning-token', 'setup-code']) await writeFile(resolve(secrets, name), 'fixture-secret-for-parser-only');
      const { stdout } = await run(standalone, [
        '--project-name', 'fluxiq-cloud-fixture',
        '-f', resolve(output, `deploy/compose/${profile}.compose.yml`),
        '-f', resolve(output, 'cloud.compose.json'), 'config', '--format', 'json',
      ], {
        env: {
          ...process.env,
          FLUXIQ_ENV_FILE: environment,
          FLUXIQ_SECRETS_DIR: secrets,
          CADDYFILE: resolve(output, 'deploy/caddy/Caddyfile.example'),
          // Verify that a mutable operator override cannot replace the image pin.
          FLUXIQ_IMAGE: 'untrusted:latest', CADDY_IMAGE: 'untrusted:latest',
        },
        maxBuffer: 1024 * 1024,
      });
      const config = JSON.parse(stdout);
      const core = config.services.fluxiq;
      assert.equal(core.image, manifest.coreImage);
      assert.equal(config.services.caddy.image, manifest.caddyImage);
      assert.equal(core.platform, 'linux/amd64');
      assert.equal(core.environment.FLUXIQ_PROFILE, profile);
      assert.equal(core.environment.FLUXIQ_ROOT, '/data');
      assert.equal(core.environment.FLUXIQ_EMAIL_API_KEY_FILE, '/run/secrets/email_api_key');
      assert.equal(core.read_only, true);
      assert.deepEqual(core.cap_drop, ['ALL']);
      assert.ok(core.security_opt.includes('no-new-privileges:true'));
      assert.equal(core.ports, undefined);
      assert.equal(core.network_mode, undefined);
      assert.equal(core.volumes.find((volume) => volume.target === '/data').type, 'bind');
      assert.equal(core.volumes.filter((volume) => volume.target === '/data').length, 1);
      assert.equal(config.services.caddy.volumes.find((volume) => volume.target === '/data').type, 'bind');
      const publicPorts = config.services.caddy.ports.map((port) => `${port.published}/${port.protocol}`);
      assert.deepEqual(publicPorts.sort(), ['443/tcp', '443/udp', '80/tcp']);
      assert.ok(core.secrets.some((secret) => secret.source === 'email_api_key'));
      if (profile === 'service') {
        assert.equal(core.environment.FLUXIQ_SECRET_KEYS_KEYRING_FILE, '/run/secrets/secret_keyring');
        assert.ok(core.secrets.some((secret) => secret.source === 'secret_keyring'));
        assert.equal(config.secrets.secret_keyring.file, '/etc/fluxiq/secrets/secret-keyring');
        assert.equal(config.networks.provisioning.internal, true);
        assert.equal(config.services.caddy.networks.provisioning, undefined);
        assert.equal(core.environment.FLUXIQ_PROVISIONING_LISTEN, '172.31.250.10:4780');
        assert.ok(core.secrets.some((secret) => secret.source === 'setup_code'));
        assert.ok(core.secrets.some((secret) => secret.source === 'provisioning_token'));
      }
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}

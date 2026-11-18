import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

function generatedUnit(script, path) {
  const marker = `cat > ${path} <<'UNIT'\n`;
  const start = script.indexOf(marker);
  assert.ok(start >= 0, `Expected generated unit ${path}`);
  return script.slice(start + marker.length, script.indexOf('\nUNIT', start + marker.length));
}

test('Docker restart policies cannot bypass state-disk identity, mount and metadata guards at boot', async () => {
  const install = await readFile(new URL('../install.sh', import.meta.url), 'utf8');
  const docker = generatedUnit(install, '/etc/systemd/system/docker.service.d/fluxiq-metadata-guard.conf');
  const state = generatedUnit(install, '/etc/systemd/system/fluxiq-state-guard.service');
  const metadata = generatedUnit(install, '/etc/systemd/system/fluxiq-metadata-guard.service');
  assert.match(docker, /^Requires=fluxiq-metadata-guard.service fluxiq-state-guard.service$/m);
  assert.match(docker, /^After=fluxiq-metadata-guard.service fluxiq-state-guard.service$/m);
  assert.match(docker, /^RequiresMountsFor=\/srv\/fluxiq$/m);
  assert.match(state, /^Before=docker.service$/m);
  assert.match(state, /^RequiresMountsFor=\/srv\/fluxiq$/m);
  assert.match(state, /^ExecStart=\/bin\/bash \/opt\/fluxiq-bootstrap\/mount-data.sh \/etc\/fluxiq-bootstrap.json$/m);
  assert.match(metadata, /^Before=docker.service$/m);
  assert.ok(install.indexOf('bash "$runtime/mount-data.sh" "$config"\n') < install.indexOf('systemctl start docker.service'));
  assert.match(install, /mount-data.sh" "\$config"\n[^\n]*\nsystemctl daemon-reload/);
  const mount = await readFile(new URL('../mount-data.sh', import.meta.url), 'utf8');
  assert.match(mount, /findmnt --noheadings --output UUID --target \/srv\/fluxiq/);
  assert.match(mount, /Configured state disk has an unexpected filesystem; refusing to format it/);
});

test('container metadata protection covers IPv4 and both published IPv6 metadata addresses', async () => {
  const guard = await readFile(new URL('../metadata-guard.sh', import.meta.url), 'utf8');
  for (const address of ['169.254.169.254/32', 'fd00:ec2::254/128', 'fd20:ce::254/128']) assert.ok(guard.includes(address));
  assert.match(guard, /DOCKER-USER.*-j DROP/);
  assert.doesNotMatch(guard, /set -[a-z]*x/);
});

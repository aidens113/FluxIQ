import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './validate-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

export async function buildRelease(manifestPath, outputPath) {
  const raw = await readFile(manifestPath, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Release manifest is not valid JSON'); }
  const manifest = validateManifest(parsed);
  const output = resolve(outputPath);
  // A release is assembled into a new directory: never overwrite an installed release or secrets.
  await mkdir(output, { recursive: false });
  await mkdir(resolve(output, 'deploy/compose'), { recursive: true });
  await mkdir(resolve(output, 'deploy/caddy'), { recursive: true });
  for (const relative of [
    `deploy/compose/${manifest.profile}.compose.yml`,
    'deploy/caddy/Caddyfile.example',
  ]) {
    await copyFile(resolve(root, relative), resolve(output, relative));
  }
  await copyFile(resolve(here, 'launch.sh'), resolve(output, 'launch.sh'));
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // The last Compose file fixes image pins and stores every persistent volume on the retained disk.
  // No build is executed: launch.sh always pulls and uses --no-build.
  const overlay = {
    services: {
      fluxiq: {
        image: manifest.coreImage,
        platform: manifest.platform,
        environment: { FLUXIQ_EMAIL_API_KEY_FILE: '/run/secrets/email_api_key' },
        secrets: ['email_api_key'],
        volumes: [{ type: 'bind', source: '/srv/fluxiq/core', target: '/data' }],
      },
      caddy: {
        image: manifest.caddyImage,
        platform: manifest.platform,
        volumes: [
          { type: 'bind', source: '/srv/fluxiq/caddy-data', target: '/data' },
          { type: 'bind', source: '/srv/fluxiq/caddy-config', target: '/config' },
        ],
      },
    },
    secrets: { email_api_key: { file: '/etc/fluxiq/secrets/email-api-key' } },
  };
  // JSON is YAML-compatible and avoids a new parser/serializer dependency.
  await writeFile(resolve(output, 'cloud.compose.json'), `${JSON.stringify(overlay, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node build.mjs MANIFEST NEW_OUTPUT_DIRECTORY');
    const manifest = await buildRelease(process.argv[2], process.argv[3]);
    process.stdout.write(`Prepared ${manifest.release}; archive this directory and pin its SHA-256.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

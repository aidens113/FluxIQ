// Names say what a thing is and paths stay shallow. Three checks: path depth
// (non-test files only, since tests sit one level deeper by design), filler
// names that describe nothing, and filename prefixes shared by enough
// siblings that the prefix should have been a directory.

export const id = "naming";
export const title = "Names are specific, paths are shallow, prefixes become directories";

const KEBAB_WITH_HYPHEN = /^[a-z0-9]+(-[a-z0-9]+)+$/;
const RESERVED_STEMS = new Set(["index", "types"]);
const EXEMPT_PREFIXES = new Set(["use"]);

// Basename with the extension and any .test/.spec marker removed:
// "project-schema.test.ts" -> "project-schema", "utils.ts" -> "utils".
function stemOf(ctx, file) {
  const base = ctx.basename(file);
  const withoutExtension = base.slice(0, base.length - ctx.extname(base).length);
  return withoutExtension.replace(/\.(test|spec)$/, "");
}

function depthFindings(ctx) {
  const { LIMITS, CONFIG } = ctx;
  const exempt = (CONFIG.depthExemptPrefixes ?? []).map((prefix) => `${prefix}/`);
  const findings = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(file)) continue;
    if (exempt.some((prefix) => file.startsWith(prefix))) continue;
    const segments = file.split("/").length;
    if (segments <= LIMITS.maxPathSegments) continue;
    findings.push({
      rule: id, key: file, value: segments, limit: LIMITS.maxPathSegments, path: file,
      message: `${file}: ${segments} path segments exceeds the ${LIMITS.maxPathSegments}-segment depth limit. Move it nearer its feature root or collapse a single-child directory on the way down.`,
      severity: "fail", ratchet: false
    });
  }
  return findings;
}

function bannedNameFindings(ctx) {
  const { CONFIG } = ctx;
  const bannedBasenames = new Set(CONFIG.bannedBasenames);
  const bannedDirectories = new Set(CONFIG.bannedDirectoryNames);
  const findings = [];
  for (const file of ctx.sourceFiles) {
    const stem = stemOf(ctx, file);
    const bannedDirectory = file.split("/").slice(0, -1).find((segment) => bannedDirectories.has(segment));
    let message;
    if (bannedBasenames.has(stem)) {
      message = `${file}: "${stem}" names nothing. Name the file for the one thing it exports, or split it.`;
    } else if (bannedDirectory !== undefined) {
      message = `${file}: the directory "${bannedDirectory}" names nothing. Name it for what it holds, or move each file next to the code it serves.`;
    } else {
      continue;
    }
    findings.push({ rule: id, key: file, value: 1, limit: 0, path: file, message, severity: "fail", ratchet: true });
  }
  return findings;
}

function prefixGroupFindings(ctx) {
  const { LIMITS } = ctx;
  const stemsByDirectory = new Map();
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(file)) continue;
    const dir = ctx.dirname(file);
    if (!stemsByDirectory.has(dir)) stemsByDirectory.set(dir, new Set());
    stemsByDirectory.get(dir).add(stemOf(ctx, file));
  }
  const findings = [];
  for (const [dir, stems] of stemsByDirectory) {
    const groups = new Map();
    for (const stem of stems) {
      if (RESERVED_STEMS.has(stem)) continue;
      if (!KEBAB_WITH_HYPHEN.test(stem)) continue;
      const prefix = stem.slice(0, stem.indexOf("-"));
      if (EXEMPT_PREFIXES.has(prefix)) continue;
      if (!groups.has(prefix)) groups.set(prefix, new Set());
      groups.get(prefix).add(stem);
    }
    for (const [prefix, members] of groups) {
      // A sibling named exactly for the prefix belongs to the same group.
      if (stems.has(prefix)) members.add(prefix);
      if (members.size < LIMITS.prefixGroup) continue;
      findings.push({
        rule: id, key: `${dir}::${prefix}`, value: members.size, limit: LIMITS.prefixGroup, path: dir,
        message: `${dir}/: ${members.size} files share the prefix "${prefix}-". Create ${ctx.basename(dir)}/${prefix}/ and strip the prefix from their names.`,
        severity: "fail", ratchet: true
      });
    }
  }
  return findings;
}

export function run(ctx) {
  return [...depthFindings(ctx), ...bannedNameFindings(ctx), ...prefixGroupFindings(ctx)];
}

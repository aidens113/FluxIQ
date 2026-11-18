// Unit tests for the server-client-boundary rule over in-memory fixture
// repositories. The base fixture is the t915 break: a server route imports a
// feature barrel whose plain loader pulls a conversation barrel and, with it,
// two modules calling hooks without "use client".

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../server-client-boundary.mjs";

const SRC = "apps/web/src/";

const BASE = {
  [`${SRC}app/chats/route.ts`]: 'import { loadChats } from "../../features/chats/index.ts";\nexport const GET = () => loadChats();',
  [`${SRC}features/chats/index.ts`]: 'export { loadChats } from "./load-chats.ts";',
  [`${SRC}features/chats/load-chats.ts`]: 'import { conversation } from "../studio/conversation/index.ts";\nexport const loadChats = () => conversation;',
  [`${SRC}features/studio/conversation/index.ts`]: 'export * from "./view-readiness.ts";\nexport { conversation } from "./conversation.ts";',
  [`${SRC}features/studio/conversation/conversation.ts`]: "export const conversation = 1;",
  [`${SRC}features/studio/conversation/view-readiness.ts`]: 'import { useState } from "react";\nexport function useReady() { return useState(false); }'
};

function makeCtx(extra = {}, config = { nextApps: [{ name: "web", src: SRC }] }) {
  const files = { ...BASE, ...extra };
  const astCache = new Map();
  const read = (file) => files[file];
  return {
    CONFIG: config,
    ts,
    files: Object.keys(files),
    scriptFiles: Object.keys(files),
    read,
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

test("a server route reaching a hook module without the directive is refused, naming the chain and the API", () => {
  const findings = run(makeCtx());
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.path, `${SRC}features/studio/conversation/view-readiness.ts`);
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
  assert.match(finding.message, /useState \(line 2\)/);
  assert.match(finding.message, /apps\/web\/src\/app\/chats\/route\.ts\s+-> apps\/web\/src\/features\/chats\/index\.ts\s+-> apps\/web\/src\/features\/chats\/load-chats\.ts\s+-> apps\/web\/src\/features\/studio\/conversation\/index\.ts\s+-> apps\/web\/src\/features\/studio\/conversation\/view-readiness\.ts/);
});

test("\"use client\" on the reached module stops the walk", () => {
  const file = `${SRC}features/studio/conversation/view-readiness.ts`;
  assert.deepEqual(run(makeCtx({ [file]: `"use client";\nimport { useState } from "react";\nexport function useReady() { return useState(false); }` })), []);
});

test("\"use client\" stops the walk before what the client module imports", () => {
  const index = `${SRC}features/studio/conversation/index.ts`;
  const hooked = `${SRC}features/studio/conversation/hooked.tsx`;
  assert.deepEqual(run(makeCtx({
    [index]: 'export { conversation } from "./conversation.ts";\nexport { Hooked } from "./hooked.tsx";',
    [`${SRC}features/studio/conversation/view-readiness.ts`]: "export const ready = 1;",
    [hooked]: '"use client";\nimport { inner } from "./inner.ts";\nexport const Hooked = inner;',
    [`${SRC}features/studio/conversation/inner.ts`]: 'import { useRef } from "react";\nexport const inner = useRef(null);'
  })), []);
});

test("type-only imports and re-exports are ignored", () => {
  const file = `${SRC}features/chats/load-chats.ts`;
  for (const text of [
    'import type { useReady } from "../studio/conversation/view-readiness.ts";\nexport const loadChats = () => 1;',
    'import { type useReady } from "../studio/conversation/view-readiness.ts";\nexport const loadChats = () => 1;',
    'export type { useReady } from "../studio/conversation/view-readiness.ts";\nexport const loadChats = () => 1;'
  ]) {
    assert.deepEqual(run(makeCtx({ [file]: text })), [], text);
  }
});

test("a value import beside a type specifier still reaches", () => {
  const file = `${SRC}features/chats/load-chats.ts`;
  const findings = run(makeCtx({ [file]: 'import { type Ready, useReady } from "../studio/conversation/view-readiness.ts";\nexport const loadChats = () => useReady;' }));
  assert.equal(findings.length, 1);
});

test("a \"use client\" entry is skipped", () => {
  assert.deepEqual(run(makeCtx({ [`${SRC}app/chats/route.ts`]: `"use client";\n${BASE[`${SRC}app/chats/route.ts`]}` })), []);
});

test("React use() and cache are server safe", () => {
  const file = `${SRC}features/studio/conversation/view-readiness.ts`;
  assert.deepEqual(run(makeCtx({ [file]: 'import { use, cache } from "react";\nexport const load = cache((promise) => use(promise));' })), []);
});

test("createContext, React.useEffect and a custom hook are flagged", () => {
  const file = `${SRC}features/studio/conversation/view-readiness.ts`;
  for (const [text, api] of [
    ['import { createContext } from "react";\nexport const Ctx = createContext(null);', "createContext"],
    ['import React from "react";\nexport const run = () => React.useEffect(() => {});', "useEffect"],
    ['export const run = () => useMyThing();', "useMyThing"],
    ['import { useRouter } from "next/navigation";\nexport const run = () => useRouter();', "useRouter"]
  ]) {
    const findings = run(makeCtx({ [file]: text }));
    assert.equal(findings.length, 1, text);
    assert.ok(findings[0].message.includes(api), text);
  }
});

test("page, layout, middleware, instrumentation and use server modules are entries", () => {
  const hook = 'import { useState } from "react";\nexport const x = () => useState(0);';
  for (const entry of [`${SRC}app/page.tsx`, `${SRC}app/a/layout.tsx`, `${SRC}app/a/not-found.tsx`, `${SRC}middleware.ts`, `${SRC}instrumentation.ts`]) {
    const findings = run(makeCtx({ [`${SRC}features/chats/load-chats.ts`]: "export const loadChats = 1;", [entry]: hook }));
    assert.equal(findings.length, 1, entry);
  }
  const quiet = { [`${SRC}features/chats/load-chats.ts`]: "export const loadChats = 1;" };
  const action = run(makeCtx({ ...quiet, [`${SRC}lib/action.ts`]: `"use server";\n${hook}` }));
  assert.equal(action.length, 1);
  // Not an entry: an ordinary module nothing server-side imports.
  assert.deepEqual(run(makeCtx({ ...quiet, [`${SRC}lib/orphan.ts`]: hook })), []);
});

test("the @/ alias and a .js specifier resolve to the source", () => {
  const findings = run(makeCtx({ [`${SRC}app/chats/route.ts`]: 'import { useReady } from "@/features/studio/conversation/view-readiness.js";\nexport const GET = useReady;' }));
  assert.equal(findings.length, 1);
});

test("packages are not followed, and no configured app means no findings", () => {
  assert.deepEqual(run(makeCtx({ [`${SRC}app/chats/route.ts`]: 'import { useThing } from "@fluxiq/ui";\nexport const GET = 1;' })), []);
  assert.deepEqual(run(makeCtx({}, {})), []);
});

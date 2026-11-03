#!/usr/bin/env node
// Edits that follow `programs-shared.json` and that a path-only move cannot make.
// Run from the Core root after the move tool:
//   node docs/working/studio-controller-plan/moves/programs-shared.post.mjs
// Each step replaces one exact string, skips when already applied, and fails
// loudly when neither the old nor the new text is there (the file changed on dev).
import fs from "node:fs";

const src = "packages/fluxiq/src";
const OWNER = "framework/persistence/resource-owner/owner-resolver.ts";
const RESOLVER_DOC = `/**
 * Resolves, and records, who owns resources of one kind. A program registers
 * one per kind it owns (\`GlobalProgramApiRegistry.registerResourceOwners\`).
 * \`ownerOf\` answers a user id, or null for none or unknown (never throws for
 * an unknown id). \`recordOwner\` is called after a declared \`creates\`.
 */
export type ProgramResourceOwnerResolver = {
  ownerOf(id: string): Promise<string | null>;
  recordOwner?(id: string, userId: string): Promise<void>;
};
`;

function edit(file, from, to) {
  const target = `${src}/${file}`;
  const raw = fs.readFileSync(target, "utf8");
  const crlf = raw.includes("\r\n");
  const text = raw.replace(/\r\n/g, "\n");
  const done = (value) => fs.writeFileSync(target, crlf ? value.replace(/\n/g, "\r\n") : value);
  if (to === "" ? !text.includes(from) : text.includes(to)) return console.log(`already applied: ${file}`);
  if (!text.includes(from)) throw new Error(`${file}: expected text not found:\n${from}`);
  done(text.replace(from, to));
  console.log(`edited: ${file}`);
}

// 1. The resource-owner port is declared where the framework implements it, so
//    the program IAM gate depends on the framework, not the reverse.
const created = `${src}/${OWNER}`;
if (!fs.existsSync(created)) {
  fs.mkdirSync(`${src}/framework/persistence/resource-owner`, { recursive: true });
  fs.writeFileSync(created, RESOLVER_DOC);
  console.log(`created: ${OWNER}`);
}
const typeBlock = `
${RESOLVER_DOC}`;
edit("programs/_shared/iam/types.ts", typeBlock, "");
edit("programs/_shared/iam/index.ts", "  ProgramResourceOwnerResolver,\n", "");
const gateOld = 'import type { ProgramOwnedResourceKind, ProgramResourceOwnerResolver, ProgramResourceRef } from "./types.ts";';
const gateNew = 'import type { ProgramResourceOwnerResolver } from "../../../framework/persistence/resource-owner/owner-resolver.ts";\nimport type { ProgramOwnedResourceKind, ProgramResourceRef } from "./types.ts";';
edit("programs/_shared/iam/program-iam-gate.ts", gateOld, gateNew);
edit("programs/_shared/iam/record-created-owner.ts", gateOld, gateNew);
edit("programs/_shared/api.ts", "  type ProgramResourceOwnerResolver,\n", "");
edit("programs/_shared/api.ts", '} from "./iam/index.ts";\n', '} from "./iam/index.ts";\nimport type { ProgramResourceOwnerResolver } from "../../framework/persistence/resource-owner/owner-resolver.ts";\n');
edit(
  "framework/persistence/automation/ownership/ownership.ts",
  'import type { ProgramResourceOwnerResolver } from "../../../../programs/_shared/iam/index.ts";',
  'import type { ProgramResourceOwnerResolver } from "../../resource-owner/owner-resolver.ts";'
);

// 2. The host reaches the IAM options type through the program catalog barrel.
edit("framework/index.ts", 'import type { ProgramApiIamOptions } from "../programs/_shared/iam/index.ts";\n', "");
edit("framework/index.ts", 'type ProgramDirectory } from "../programs/index.ts";', 'type ProgramDirectory, type ProgramApiIamOptions } from "../programs/index.ts";');
edit("programs/index.ts", 'export * from "./_shared/docs-generators.ts";\n', 'export * from "./_shared/docs-generators.ts";\nexport type { ProgramApiIamOptions } from "./_shared/iam/index.ts";\n');

// 3. A probe loads emitted modules by a dist-relative string, which a move tool
//    that rewrites specifiers and src/ or dist/ prefixed paths does not see.
edit(
  "framework/automation-service/service/recordings/tests/process-probe.mjs",
  'load("programs/_shared/storage.js")',
  'load("framework/persistence/program-state/storage.js")'
);

// 4. The residual edges of programs/ (second pass): framework and runtime declare the ports they need,
//    and Identity Access and the program registry satisfy them structurally.
const ownership = "framework/persistence/automation/ownership";
edit(`${ownership}/types.ts`, 'import type { User } from "../../../../programs/identity-access/index.ts";\n\n', "");
edit(
  `${ownership}/types.ts`,
  'export type AutomationStudioProjectOwnerCandidate = Pick<User, "id" | "roleId" | "enabled" | "createdAtMs">;',
  [
    "export type AutomationStudioProjectOwnerCandidate = { id: string; roleId: string; enabled: boolean; createdAtMs: number };",
    "",
    "/** What the default owner is read from: any directory of users, such as Identity Access. */",
    "export type AutomationStudioProjectOwnerDirectory = {",
    "  snapshot(): Promise<{ users: AutomationStudioProjectOwnerCandidate[] }>;",
    "};"
  ].join("\n")
);
edit(
  `${ownership}/default-owner.ts`,
  'import { adminRole } from "../../../../programs/identity-access/index.ts";\nimport type { AutomationStudioProjectOwnerDefaults } from "./types.ts";',
  [
    'import type { AutomationStudioProjectOwnerDefaults } from "./types.ts";',
    "",
    "/** The id of Identity Access's `admin` role, which a default owner must hold. */",
    'const ADMIN_ROLE_ID = "admin";'
  ].join("\n")
);
edit(`${ownership}/default-owner.ts`, "adminRole.id", "ADMIN_ROLE_ID");
edit(`${ownership}/ownerships.ts`, 'import type { IdentityAccessService } from "../../../../programs/identity-access/index.ts";\n', "");
edit(
  `${ownership}/ownerships.ts`,
  'import { automationStudioServiceProjectCatalog } from "./service-catalog.ts";',
  'import { automationStudioServiceProjectCatalog } from "./service-catalog.ts";\nimport type { AutomationStudioProjectOwnerDirectory } from "./types.ts";'
);
edit(`${ownership}/ownerships.ts`, "identityAccess: IdentityAccessService | undefined", "identityAccess: AutomationStudioProjectOwnerDirectory | undefined");

const commands = "runtime/conversations/commands";
edit(
  `${commands}/port.ts`,
  'import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../programs/_shared/api.ts";\nimport type { ProgramScope } from "../../../programs/_shared/types.ts";\nimport type { AutomationStudioConversationCommandPort } from "./command.ts";\n',
  [
    'import type { AutomationStudioConversationCommandPort } from "./command.ts";',
    "",
    "/** Who a command calls as: the request's own session, user, role and permissions. */",
    "export type AutomationStudioConversationCommandActor = {",
    "  sessionId: string;",
    "  userId: string;",
    "  roleId: string;",
    "  permissions: string[];",
    '  channel?: "panel" | "paired-client";',
    "};",
    "",
    "/** The domain a command runs in. */",
    "export type AutomationStudioConversationCommandScope = { domainId?: string | null };",
    "",
    "/**",
    " * What the port needs of the program registry, which satisfies it: list endpoints with their",
    " * classification, and call one.",
    " */",
    "export type AutomationStudioConversationCommandRegistry = {",
    "  call(request: {",
    "    programId: string;",
    "    endpoint: string;",
    "    scope: AutomationStudioConversationCommandScope;",
    "    actor?: AutomationStudioConversationCommandActor;",
    "    payload?: unknown;",
    "  }): Promise<{ ok: boolean; payload?: unknown; error?: string }>;",
    "  endpoints(): { programId: string; endpoint: string; classification: string }[];",
    "};",
    ""
  ].join("\n")
);
edit(
  `${commands}/port.ts`,
  '  registry: Pick<GlobalProgramApiRegistry, "call" | "endpoints">;\n  actor: ProgramApiActor;\n  scope: ProgramScope;',
  "  registry: AutomationStudioConversationCommandRegistry;\n  actor: AutomationStudioConversationCommandActor;\n  scope: AutomationStudioConversationCommandScope;"
);

// The port is tested against the real registry, which makes two subjects: that test goes to src/tests.
const movedTest = `${src}/tests/conversation-command-port.test.ts`;
if (!fs.existsSync(movedTest)) {
  fs.mkdirSync(`${src}/tests`, { recursive: true });
  fs.copyFileSync(new URL("./programs-shared.conversation-command-port.test.txt", import.meta.url), movedTest);
  const old = `${src}/${commands}/tests/port.test.ts`;
  const raw = fs.readFileSync(old, "utf8");
  const text = raw.replace(/\r\n/g, "\n");
  const from = text.indexOf('describe("automationStudioConversationCommandPort"');
  const to = text.indexOf('describe("automationStudioConversationEffectiveCaller"');
  if (from < 0 || to < 0) throw new Error("port.test.ts: describe blocks not found");
  let rest = text.slice(0, from) + text.slice(to);
  rest = rest.replace(/import \{ GlobalProgramApiRegistry[^\n]*\n/, "").replace('import { automationStudioConversationCommandPort } from "../port.ts";\n', "").replace(/const actor = [^\n]*\n\n/, "");
  rest = rest.replace("// The port a command reaches Core through, and whose session it runs under.", "// Whose session a command runs under, and the vocabulary it is shown. The port itself is tested against the registry in src/tests/.");
  fs.writeFileSync(old, raw.includes("\r\n") ? rest.replace(/\n/g, "\r\n") : rest);
  console.log("split: port.test.ts -> src/tests/conversation-command-port.test.ts");
}

// 5. After programs-shared-tests.json: the moved tests sit outside the directories they import from, so they
//    take those directories' barrels (the imports rule counts a file import past a barrel).
const barrel = (file, from, to) => edit(`tests/${file}`, `"${from}"`, `"${to}"`);
barrel("anthropic-session-panel.test.ts", "../runtime/llm/session-key-provider.ts", "../runtime/llm/index.ts");
barrel("anthropic-session-panel.test.ts", "../runtime/llm/anthropic/panel-command.ts", "../runtime/llm/anthropic/index.ts");
barrel("session-key-provider.test.ts", "../runtime/llm/session-key-provider.ts", "../runtime/llm/index.ts");
barrel("deepseek-session-key.test.ts", "../runtime/llm/deepseek/session-key.ts", "../runtime/llm/deepseek/index.ts");
barrel("ownership-default-owner.test.ts", "../framework/persistence/automation/ownership/default-owner.ts", "../framework/persistence/automation/ownership/index.ts");

// 6. The host closes program-state connections, which framework owns now: it takes them from there, not the catalog.
edit("framework/index.ts", "createGlobalProgramRuntime, programStateConnections, registerHostDocumentationGenerators", "createGlobalProgramRuntime, registerHostDocumentationGenerators");
edit(
  "framework/index.ts",
  'from "../programs/index.ts";\n',
  'from "../programs/index.ts";\nimport { programStateConnections } from "./persistence/program-state/state-connections.ts";\n'
);

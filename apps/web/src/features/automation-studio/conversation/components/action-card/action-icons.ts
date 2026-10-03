// The lucide component for each action kind's icon. The names are Core's
// (`ACTIVITY_ACTION_ICONS` in `fluxiq/ui`); this only resolves each name to
// its component, so the bundle carries these fifteen icons and not the whole
// set. A kind Core adds fails the typecheck here until it has one, and
// `../tests/ConversationActionCard.test.tsx` holds every component to Core's name.

import {
  CircleDot,
  FlaskConical,
  GitBranch,
  GitMerge,
  Globe,
  Hand,
  Hourglass,
  Keyboard,
  MousePointerClick,
  Pencil,
  Repeat,
  ScanSearch,
  ShieldCheck,
  Table,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { ActivityActionKind } from "fluxiq/ui";

export const CONVERSATION_ACTION_ICONS: Readonly<Record<ActivityActionKind, LucideIcon>> = {
  click: MousePointerClick,
  type: Keyboard,
  navigate: Globe,
  read: Table,
  look: ScanSearch,
  recall: ScanSearch,
  wait: Hourglass,
  person_check: ShieldCheck,
  permission: Hand,
  draft: Pencil,
  test: FlaskConical,
  result_check: ScanSearch,
  repair: Wrench,
  join: GitMerge,
  branch: GitBranch,
  repeat: Repeat,
  other: CircleDot
};

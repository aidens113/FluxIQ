// The lucide icons the chat's own chrome draws: the chat window's launcher and
// bar, the welcome's lines, the marks beside an attachment and a warning, and
// the added and removed marks a host's attachment drawer uses.
// They are not icons Core pins for action cards (`lucide-nodes.ts` holds
// exactly those), so they live apart and `lucideIcon` looks in both.
//
// Path data copied from lucide-react v0.468.0, ISC licence (the notice is in
// `lucide-nodes.ts`).

import type { LucideIconNode } from "./lucide-nodes.ts";

/** Each icon's elements, by lucide name (kebab case). */
export const LUCIDE_CHROME_ICON_NODES: Readonly<Record<string, readonly LucideIconNode[]>> = Object.freeze({
  "messages-square": [
    ["path", { d: "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" }],
    ["path", { d: "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" }]
  ],
  "maximize-2": [
    ["polyline", { points: "15 3 21 3 21 9" }],
    ["polyline", { points: "9 21 3 21 3 15" }],
    ["line", { x1: "21", x2: "14", y1: "3", y2: "10" }],
    ["line", { x1: "3", x2: "10", y1: "21", y2: "14" }]
  ],
  "minimize-2": [
    ["polyline", { points: "4 14 10 14 10 20" }],
    ["polyline", { points: "20 10 14 10 14 4" }],
    ["line", { x1: "14", x2: "21", y1: "10", y2: "3" }],
    ["line", { x1: "3", x2: "10", y1: "21", y2: "14" }]
  ],
  plus: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "M12 5v14" }]
  ],
  minus: [
    ["path", { d: "M5 12h14" }]
  ],
  "chevron-down": [
    ["path", { d: "m6 9 6 6 6-6" }]
  ],
  paperclip: [
    ["path", { d: "M13.234 20.252 21 12.3" }],
    ["path", { d: "m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486" }]
  ],
  "triangle-alert": [
    ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }]
  ],
  "key-round": [
    ["path", { d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" }],
    ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor" }]
  ],
  split: [
    ["path", { d: "M16 3h5v5" }],
    ["path", { d: "M8 3H3v5" }],
    ["path", { d: "M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" }],
    ["path", { d: "m15 9 6-6" }]
  ],
  "pen-line": [
    ["path", { d: "M12 20h9" }],
    ["path", { d: "M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" }]
  ]
});

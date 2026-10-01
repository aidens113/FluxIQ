import { expect, it } from "vitest";
import { buildDocumentationTree } from "../../live-views/shared";
import { flattenDocumentationTree } from "../flattenDocumentationTree";
it("preserves complete source-aware preorder and parent paths", () => {
  const tree = buildDocumentationTree(Array.from({ length: 1250 }, (_, i) => ({ id: `p${i}`, sourceId: "s", title: `${i}`, path: `s/group/page-${i}.md` })));
  const rows = flattenDocumentationTree(tree, new Set(["s", "s/group"])); expect(rows.filter(row => row.node.page)).toHaveLength(1250); expect(rows[0]!.parentPath).toBeUndefined(); expect(rows[1]!.parentPath).toBe("s"); expect(rows[2]!.parentPath).toBe("s/group"); expect(rows[2]!.depth).toBe(2);
  expect(flattenDocumentationTree(tree, new Set()).map(row => row.node.path)).toEqual(["s"]);
});

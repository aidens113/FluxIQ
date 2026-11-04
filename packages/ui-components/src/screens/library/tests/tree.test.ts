import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { fakeSubflowCards } from "../../../testing/library/index.ts";
import { buildTree, distinctBelow, filterTree, type LibraryTreeNode, type SubflowCard } from "../index.ts";

const card = (partId: string, calls: string[] = [], sites = ["https://shop.example"]): SubflowCard => ({
  partId, version: 1, name: partId.toUpperCase(), purpose: `Does ${partId}.`, sites, inputs: [], outputs: [], fixedValues: [], lastingClasses: [],
  calls: calls.map((id) => ({ partId: id, version: 1 })), trust: { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } }
});

const names = (nodes: readonly LibraryTreeNode[]): unknown[] => nodes.map((node) => (node.children.length === 0 ? node.partId : [node.partId, names(node.children)]));
const everyPart = (nodes: readonly LibraryTreeNode[]): Set<string> => new Set(nodes.flatMap(distinctBelow));

describe("the library as a tree", () => {
  test("groups by site host, and nests what a subflow calls under it, with a count of what it uses", () => {
    const sites = buildTree(fakeSubflowCards(0));
    assert.deepEqual(sites.map((site) => [site.host, site.count]), [["harbour-library.example", 1], ["paperworks.example", 3]]);
    const shop = sites[1]!;
    assert.deepEqual(names(shop.nodes), [["restock-notebooks", [["add-to-basket", ["choose-colour"]]]]]);
    assert.equal(shop.nodes[0]!.uses, 2);
    assert.equal(shop.nodes[0]!.children[0]!.uses, 1);
    assert.equal(shop.nodes[0]!.children[0]!.children[0]!.uses, 0);
  });

  test("a subflow nothing calls is at the top level, and one that is called shows only under its caller", () => {
    const [site] = buildTree([card("a", ["b"]), card("b"), card("c")]);
    assert.deepEqual(names(site!.nodes), [["a", ["b"]], "c"]);
  });

  test("a cycle never hangs and never drops a subflow", () => {
    const [site] = buildTree([card("a", ["b"]), card("b", ["a"]), card("c", ["a"])]);
    assert.deepEqual([...everyPart(site!.nodes)].sort(), ["a", "b", "c"]);
    const [only] = buildTree([card("x", ["y"]), card("y", ["x"])]);
    assert.deepEqual([...everyPart(only!.nodes)].sort(), ["x", "y"], "two that only call each other are both shown");
    const again = only!.nodes[0]!.children[0]!.children[0]!;
    assert.equal(again.repeat, true, "the call back up the path is a row, and is not opened again");
    assert.equal(again.children.length, 0);
  });

  test("a subflow that calls itself is not a loop, and a call to something not listed is a row with no card", () => {
    const [site] = buildTree([card("a", ["a", "missing"])]);
    assert.deepEqual(names(site!.nodes), [["a", ["missing"]]]);
    assert.equal(site!.nodes[0]!.children[0]!.card, undefined);
    assert.equal(site!.nodes[0]!.uses, 0);
  });

  test("a subflow on two sites is on both, and one on none is under No site", () => {
    const sites = buildTree([card("a", [], ["https://one.example", "https://two.example"]), card("b", [], [])]);
    assert.deepEqual(sites.map((site) => [site.host, site.nodes.map((node) => node.partId)]), [["No site", ["b"]], ["one.example", ["a"]], ["two.example", ["a"]]]);
  });

  test("keeps the newest version of a subflow listed twice", () => {
    const old = { ...card("a"), version: 1, name: "Old" };
    const [site] = buildTree([old, { ...old, version: 3, name: "New" }]);
    assert.equal(site!.nodes.length, 1);
    assert.equal(site!.nodes[0]!.card!.name, "New");
  });
});

describe("searching the tree", () => {
  const sites = buildTree(fakeSubflowCards(0));

  test("keeps every match with the path down to it, and says which rows are only the path", () => {
    const found = filterTree(sites, "colour");
    assert.equal(found.matches, 1);
    assert.deepEqual(found.sites.map((site) => site.host), ["paperworks.example"]);
    const top = found.sites[0]!.nodes[0]!;
    assert.deepEqual(names([top]), [["restock-notebooks", [["add-to-basket", ["choose-colour"]]]]]);
    assert.deepEqual([top.matched, top.children[0]!.matched, top.children[0]!.children[0]!.matched], [false, false, true]);
    assert.equal(sites[1]!.nodes[0]!.matched, true, "the tree itself is not changed");
  });

  test("finds a fixed value, a site and an input by their words, and needs every word typed", () => {
    assert.equal(filterTree(sites, "sea green").matches, 1);
    assert.equal(filterTree(sites, "harbour").matches, 1);
    assert.equal(filterTree(sites, "how many").matches, 1);
    assert.equal(filterTree(sites, "colour harbour").matches, 0);
    assert.deepEqual(filterTree(sites, "zzz").sites, []);
  });

  test("no words keep everything", () => {
    const all = filterTree(sites, "  ");
    assert.equal(all.sites.length, 2);
    assert.equal(all.matches, 4);
  });
});

// The harness barrel under its historical name, for consumers outside its
// import cycle. A module inside the cycle imports from the file under
// ./harness/ that owns what it needs instead: `export *` copies only what the
// barrel has defined when this file evaluates, so inside the cycle a name read
// through here can arrive undefined (t351, t358). The structure audit's
// import-cycles rule refuses any new loop through here.
export * from "./harness/index.ts";

// Recorded evidence of live run run-mwyfoz8o-507c92f6, step 0101 (the judge of attempt 2's replay), cut to what the
// result's processing reads: each contributing page's rows in the read's own six fields, the declared process as the
// request carried it (without the framework's stamp), and the rows the answer kept. Copied from
// lab-runs/2026-11-26/run-mwyfoz8o-507c92f6/steps/0101-judge/request.json; nothing invented.
import type { JsonObject } from "../../../../../../../../core/index.ts";

export const RUN_MWYFOZ8O_INSTRUCTION = "On Rolefinch, find every job with Rust in its title that is fully remote and based in the UK, and whose advertised yearly salary starts at £70,000 or more. Go through every page of results and list each job once, even where the site shows it more than once, and leave out postings that give only a day rate, only an upper limit, or no salary at all. Give me a table with columns title, company, salary and link, where salary is written exactly as the posting shows it and link is the address of the job's own page on Rolefinch, newest posting first.";

/** The read's fields, in its order. */
export const RUN_MWYFOZ8O_FIELDS = ["title","link","company","location","salary","posted"] as const;

/** The three pages the answer was made from, in the order they were read. */
export const RUN_MWYFOZ8O_PAGES: { place: string | null; rows: JsonObject[] }[] = [
  { place: "page=1", rows: [
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/pagead/clk?ad=d540e5122d9445c8","company":"Quillmark","location":"Remote (UK)","salary":"£85,000 – £100,000 a year","posted":"Today"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/viewjob?jk=9acf8f84c9c767ef","company":"Quillmark","location":"Remote (UK)","salary":"£85,000 – £100,000 a year","posted":"Today"},
    {"title":"Rust Engineer","link":"/scenarios/job-board/viewjob?jk=ac58203bb79abdb3","company":"Saltmarsh Games","location":"Remote (UK)","salary":"£65,000 – £80,000 a year","posted":"Posted 1 day ago"},
    {"title":"Rust Engineer (Developer Tooling)","link":"/scenarios/job-board/viewjob?jk=43975bf62ae173be","company":"Northgate Mobility","location":"Remote (UK)","salary":"£65,000 – £80,000 a year","posted":"Just posted"},
    {"title":"Rust Engineer, Settlement Systems","link":"/scenarios/job-board/viewjob?jk=9d7b94c21b4c8525","company":"Copperline Payments","location":"Remote (UK)","salary":"£72k – £80k per annum","posted":"Posted 1 day ago"},
    {"title":"Trust & Safety Engineer","link":"/scenarios/job-board/viewjob?jk=9cb6af983905a661","company":"Pinecrest Retail","location":"Remote (UK)","salary":"£75,000 – £85,000 a year","posted":"Posted 2 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/pagead/clk?ad=09c59e4dc0d61167","company":"Quillmark Labs","location":"Remote (UK)","salary":"£60,000 – £75,000 a year","posted":"Posted 10 days ago"},
    {"title":"Backend Engineer – Rust","link":"/scenarios/job-board/viewjob?jk=1e8f9c09e6cfc45a","company":"Halvard Systems","location":"Remote (UK)","salary":"£90,000 a year","posted":"Posted 3 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/viewjob?jk=a1d728e3b919620a","company":"Kestrel & Vane","location":"Remote (Europe)","salary":"€85.000 – €100.000 a year","posted":"Posted 2 days ago"},
    {"title":"Staff Rust Engineer","link":"/scenarios/job-board/viewjob?jk=6df5833039c71789","company":"Parsec Grid","location":"Remote (UK)","salary":"From £95,000 a year","posted":"Posted 4 days ago"},
    {"title":"Rust Engineer","link":"/scenarios/job-board/viewjob?jk=4788ecdfd1c10f6a","company":"Lumen Harbor","location":"Remote (US)","salary":"$150,000 – $175,000 a year","posted":"Posted 3 days ago"},
    {"title":"Rust Contractor – Trading Systems","link":"/scenarios/job-board/viewjob?jk=28bfb774282c4c36","company":"Ashgrove Bank","location":"Remote (UK)","salary":"£650 – £750 a day","posted":"Posted 4 days ago"}
  ] },
  { place: "page=2", rows: [
    {"title":"Rust Developer","link":"/scenarios/job-board/pagead/clk?ad=838e72b62231d5d5","company":"Castellan Health","location":"Hybrid (Manchester)","salary":"£75,000 a year","posted":"Posted 7 days ago"},
    {"title":"Rust Developer (Embedded)","link":"/scenarios/job-board/viewjob?jk=ecf3e8a3b24e22b0","company":"Tidewell Energy","location":"Remote (UK)","salary":"£70,000 – £78,000 a year","posted":"Posted 6 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/viewjob?jk=eb2e64386fa20bec","company":"Marlowe Freight","location":"Remote (UK)","salary":"Up to £95,000 a year","posted":"Posted 5 days ago"},
    {"title":"Senior Go Engineer","link":"/scenarios/job-board/viewjob?jk=a675108c72376406","company":"Castellan Health","location":"Remote (UK)","salary":"£80,000 – £95,000 a year","posted":"Posted 3 days ago"},
    {"title":"Rust Engineer","link":"/scenarios/job-board/viewjob?jk=d2c12bd3d3296e40","company":"Brightwater Analytics","location":"Remote (UK)","salary":"","posted":"Posted 6 days ago"},
    {"title":"Rust Engineer","link":"/scenarios/job-board/viewjob?jk=bcf309d7d8ec933d","company":"Kestrel & Vane","location":"Remote (UK)","salary":"£69,500 – £90,000 a year","posted":"Posted 7 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/pagead/clk?ad=44afc6c23e00d1c0","company":"Marlowe Freight","location":"Remote (UK)","salary":"Up to £95,000 a year","posted":"Posted 5 days ago"},
    {"title":"Principal Engineer (Rust, Distributed Systems)","link":"/scenarios/job-board/viewjob?jk=0f5bcecd219ffd64","company":"Orbisat","location":"Remote (UK)","salary":"£110,000 – £130,000 a year","posted":"Posted 9 days ago"},
    {"title":"Senior Rust Engineer (Contract)","link":"/scenarios/job-board/viewjob?jk=12989de62c149c5b","company":"Quillmark","location":"Remote (UK)","salary":"£600 – £700 a day","posted":"Posted 8 days ago"},
    {"title":"Rust Engineer, Graduate Programme","link":"/scenarios/job-board/viewjob?jk=4ca89d5aeb910da6","company":"Oakridge Freight","location":"Remote (UK)","salary":"£38,000 a year","posted":"Posted 10 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/viewjob?jk=feb2238d8a72860d","company":"Quillmark Labs","location":"Remote (UK)","salary":"£60,000 – £75,000 a year","posted":"Posted 10 days ago"},
    {"title":"Rust Platform Engineer","link":"/scenarios/job-board/viewjob?jk=0e3af09b76dd6783","company":"Verity Legal Tech","location":"Remote (UK)","salary":"£75,000 – £88,000 a year","posted":"Posted 13 days ago"}
  ] },
  { place: null, rows: [
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/pagead/clk?ad=d540e5122d9445c8","company":"Quillmark","location":"Remote (UK)","salary":"£85,000 – £100,000 a year","posted":"Today"},
    {"title":"Engineering Manager, Payments Platform","link":"/scenarios/job-board/viewjob?jk=116900366eecf508","company":"Copperline Payments","location":"Remote (UK)","salary":"£120,000 – £140,000 a year","posted":"Posted 7 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/viewjob?jk=5821beeda2d3f111","company":"Quillmark","location":"Hybrid (London)","salary":"£90,000 – £105,000 a year","posted":"Posted 1 day ago"},
    {"title":"Rust Developer","link":"/scenarios/job-board/viewjob?jk=e9aabc4a9007feda","company":"Castellan Health","location":"Hybrid (Manchester)","salary":"£75,000 a year","posted":"Posted 7 days ago"},
    {"title":"Rust Engineer","link":"/scenarios/job-board/viewjob?jk=7bb1446052b8ec5a","company":"Halvard Systems","location":"Leeds","salary":"£70,000 – £80,000 a year","posted":"Posted 5 days ago"},
    {"title":"Senior Rust Engineer","link":"/scenarios/job-board/pagead/clk?ad=09c59e4dc0d61167","company":"Quillmark Labs","location":"Remote (UK)","salary":"£60,000 – £75,000 a year","posted":"Posted 10 days ago"}
  ] }
];

/** The process the request's `resultEvidence.processing.declared` carried, without its `declaration` stamp. */
export const RUN_MWYFOZ8O_PROCESS: JsonObject = {"derive":[{"id":"salary_min","from":"salary","pattern":"^(?:From\\s*)?£\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?k?)","as":"number"}],"dedupe":{"by":["link"]},"where":[{"field":"title","matches":"\\bRust\\b"},{"field":"location","contains":"Remote (UK)"},{"field":"salary","matches":"^(From )?£[0-9,]+k?( – £[0-9,]+k?)?( a year| per annum)$"},{"field":"salary_min","atLeast":70000},{"field":"link","contains":"/viewjob?jk="}],"sort":[{"field":"posted","order":"desc","as":"date"}],"columns":["title","company","salary","link"]};

/** The answer's rows as the judge was shown them (`recordSets[0].sampleRows`), in the answer's order. */
export const RUN_MWYFOZ8O_KEPT: JsonObject[] = [
  {"title":"Senior Rust Engineer","company":"Quillmark","salary":"£85,000 – £100,000 a year","link":"/scenarios/job-board/viewjob?jk=9acf8f84c9c767ef"},
  {"title":"Rust Engineer, Settlement Systems","company":"Copperline Payments","salary":"£72k – £80k per annum","link":"/scenarios/job-board/viewjob?jk=9d7b94c21b4c8525"},
  {"title":"Backend Engineer – Rust","company":"Halvard Systems","salary":"£90,000 a year","link":"/scenarios/job-board/viewjob?jk=1e8f9c09e6cfc45a"},
  {"title":"Staff Rust Engineer","company":"Parsec Grid","salary":"From £95,000 a year","link":"/scenarios/job-board/viewjob?jk=6df5833039c71789"},
  {"title":"Rust Developer (Embedded)","company":"Tidewell Energy","salary":"£70,000 – £78,000 a year","link":"/scenarios/job-board/viewjob?jk=ecf3e8a3b24e22b0"},
  {"title":"Principal Engineer (Rust, Distributed Systems)","company":"Orbisat","salary":"£110,000 – £130,000 a year","link":"/scenarios/job-board/viewjob?jk=0f5bcecd219ffd64"},
  {"title":"Rust Platform Engineer","company":"Verity Legal Tech","salary":"£75,000 – £88,000 a year","link":"/scenarios/job-board/viewjob?jk=0e3af09b76dd6783"}
];

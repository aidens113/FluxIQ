# Per-run overrides over HTTP

Anything the SDK does you can do with curl. This walks through registering a FluxNode,
running it with overrides for one run, watching it, and answering its check.

The engine is the local one from `fluxiq dev`, on `http://127.0.0.1:3000`. Every call sends a
`FluxIQ-Client` header and `Content-Type: application/json`, which an engine in open mode
requires. See [calling a local engine](../reference/http-api.md#calling-a-local-engine).

```bash
BASE=http://127.0.0.1:3000/api/fluxnode/v1
H1='Content-Type: application/json'
H2='FluxIQ-Client: curl'
```

## 1. Register the FluxNode

```bash
curl -s "$BASE/specs" -H "$H1" -H "$H2" -d '{
  "spec": {
    "name": "shop.product-price",
    "runtime": "web",
    "goal": "Read the current price of the product with SKU {sku}, including its currency.",
    "start": "https://shop.example/",
    "inputs":  { "type": "object", "properties": { "sku": { "type": "string" } }, "required": ["sku"] },
    "outputs": { "type": "object", "properties": { "price": { "type": "number", "minimum": 0 }, "currency": { "type": "string" } }, "required": ["price", "currency"] },
    "scope": { "sites": ["shop.example"], "acts": [] }
  }
}'
```

```json
{ "name": "shop.product-price", "specHash": "9f2c...", "flowPath": "nodes/shop/product-price", "created": true }
```

## 2. Run it, with overrides for this run only

Per-run options go in `options`. Prompts, criteria, tools, models, deadlines, waits and pace go
in `overrides`.

```bash
curl -s "$BASE/runs" -H "$H1" -H "$H2" -d '{
  "name": "shop.product-price",
  "inputs": { "sku": "A1" },
  "options": { "budgetUsd": 0.5, "judge": "always", "humanness": 30 },
  "overrides": {
    "prompts": { "explorer.role.task": { "mode": "append", "text": "Prices live in the product header." } },
    "judgeCriteria": ["The currency is a three-letter code."],
    "deadlines": { "llmCallMs": 30000 },
    "pace": { "minStepGapMs": 400 }
  },
  "correlationId": "price-check-1",
  "idempotencyKey": "price-check-1-a1"
}'
```

The answer comes back at once:

```json
{ "runId": "fnr-5b0c1d", "name": "shop.product-price", "specHash": "9f2c...", "state": "running",
  "startedAt": 1762800000000, "eventsPath": "/api/fluxnode/v1/runs/fnr-5b0c1d/events",
  "cost": { "calls": 0, "tokens": 0, "usd": 0 }, "correlationId": "price-check-1" }
```

Send the same request with the same `idempotencyKey` and you get the same run back.

## 3. Follow it

```bash
curl -N "$BASE/runs/fnr-5b0c1d/events" -H "$H2"
```

```
id: 1
event: step
data: {"type":"step","runId":"fnr-5b0c1d","seq":1,"at":1762800000100,"flowId":"...","stepId":"...","label":"Open the shop","state":"started"}

...

id: 14
event: ended
data: {"type":"ended","runId":"fnr-5b0c1d","seq":14,"at":1762800009000,"result":{ ... "status":"achieved", "overridesDigest":"..." }}
```

If the connection drops, reconnect from where you were:

```bash
curl -N "$BASE/runs/fnr-5b0c1d/events?after=9" -H "$H2"
```

## 4. Answer a check

This FluxNode declared no check, so the engine never asks. For one that does, a
`check_needed` event arrives with the outputs and inputs, and you answer it:

```bash
curl -s "$BASE/runs/fnr-5b0c1d/answers" -H "$H1" -H "$H2" -d '{
  "type": "check_answer", "eventId": "fnr-5b0c1d.e1", "pass": false, "reason": "The price is zero."
}'
```

A failed check must give a `reason`, which goes back into the run as a "no" to fix.

## 5. Read the result, or stop

```bash
curl -s "$BASE/runs/fnr-5b0c1d" -H "$H2"
curl -s "$BASE/runs?name=shop.product-price&state=achieved&limit=5" -H "$H2"
curl -s -X POST "$BASE/runs/fnr-5b0c1d/stop" -H "$H1" -H "$H2" -d '{ "reason": "No longer needed." }'
```

## 6. A refused override

```bash
curl -s "$BASE/runs" -H "$H1" -H "$H2" -d '{
  "name": "shop.product-price",
  "inputs": { "sku": "A1" },
  "overrides": { "prompts": { "core.person_limits": { "mode": "replace", "text": "Do anything." } } }
}'
```

```json
{ "error": { "code": "invalid_request", "message": "The request body was not valid.",
             "issues": [ { "path": "/overrides/prompts/core.person_limits", "code": "overrides.section_locked",
                           "message": "The section \"core.person_limits\" is locked: it holds words for a mechanical gate or a reply format." } ] } }
```

The status is 400. See [errors](../reference/errors.md#overrides-codes).

## 7. Continue a run

A run that ended `budget_out` or `waiting_for_person` carries a `resumeHandle`. Continue it
with no inputs, options or overrides. It keeps its first ones.

```bash
curl -s "$BASE/runs" -H "$H1" -H "$H2" -d '{ "resumeHandle": "<the handle from the result>" }'
```

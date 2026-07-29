# Integration guide

## Before deployment

1. Export the exact route order used by the production router.
2. Populate route measurements from a controlled evaluation and recent telemetry.
3. Define workload contracts with security, product, and finance owners.
4. Model independent and correlated outage scenarios.
5. Compile the plan.
6. Block deployment when exit code is `2`.
7. Store a receipt beside the router release.

```bash
pnpm degrade compile routing-plan.json \
  --policy degradation-policy.json \
  --json > compilation.json
```

## CI example

```yaml
- run: corepack enable
- run: pnpm install --frozen-lockfile
- run: pnpm degrade compile architecture/plan.json --policy architecture/policy.json
```

## Runtime alignment

DegradeProof is valuable only when runtime fallback order matches `fallbackIds`. Generate both the router configuration and DegradeProof plan from one source when possible.

Monitor actual provider, route, latency, cost, context, retention, and continuity properties. Recompile whenever these measurements or contracts change.

## Graph review

```bash
pnpm degrade graph routing-plan.json \
  --policy degradation-policy.json \
  --output fallback.dot

dot -Tsvg fallback.dot > fallback.svg
```

## Receipts

A receipt binds the plan, policy, deterministic compilation, and every non-failing outcome ID. Verification recompiles with the original timestamp. Add external signing when publisher identity must be authenticated.

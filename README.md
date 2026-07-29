# DegradeProof

**A graceful-degradation contract compiler for multi-provider AI systems.**

DegradeProof simulates model, provider, and region outages before production. For every workload and failure scenario, it follows the real ordered fallback graph and proves whether the selected route still satisfies privacy, residency, capability, context, quality, latency, cost, retention, and conversation-continuity requirements.

> Availability says a request completed. DegradeProof asks whether it completed under the same contract.

## Why this exists

AI failover is not equivalent to ordinary HTTP failover. A backup model can be available while silently:

- moving restricted input to another jurisdiction;
- dropping tool-calling or structured-output capabilities;
- truncating conversation history;
- retaining data that the primary route would not store;
- falling below a quality floor;
- exceeding latency or cost budgets.

DegradeProof compiles these failure paths instead of trusting that every fallback is interchangeable.

```text
failover plan + workload contracts + outage scenarios
                           │
                           ▼
                  ordered route simulator
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      contract-safe route          blocked outcome
             │
             ▼
      tamper-evident receipt
```

## What it catches

- Missing primary or fallback routes
- Cyclic and unreachable fallback chains
- Provider and region concentration
- Outages with no surviving route
- Restricted data sent to an incompatible route
- Data-residency and provider-allowlist violations
- Lost tool, JSON, vision, or application-specific capabilities
- Context-window regression
- Quality, P95 latency, and token-cost budget breaches
- Input-retention regression
- Conversation-state loss
- Excessive fallback depth
- Scenario targets that no longer exist in the plan

## Quick start

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm degrade demo resilient
pnpm degrade demo brittle
```

The brittle demo exits with code `2`, which makes DegradeProof suitable for CI and deployment gates.

Create editable starter manifests:

```bash
pnpm degrade init my-ai-router
pnpm degrade compile my-ai-router/resilient-plan.json \
  --policy my-ai-router/policy.json
```

## Commands

```bash
# Summarize a plan
pnpm degrade inspect examples/resilient-plan.json

# Compile all workload × scenario outcomes
pnpm degrade compile examples/resilient-plan.json \
  --policy examples/policy.json

# Print the complete outcome matrix
pnpm degrade matrix examples/resilient-plan.json \
  --policy examples/policy.json

# Explain one outage, optionally narrowed to a workload
pnpm degrade simulate examples/resilient-plan.json \
  --policy examples/policy.json \
  --scenario dual-cloud-outage \
  --workload automation-agent

# Export the ordered fallback graph
pnpm degrade graph examples/resilient-plan.json \
  --policy examples/policy.json \
  --output fallback.dot

# Issue and verify a tamper-evident receipt
pnpm degrade receipt examples/resilient-plan.json \
  --policy examples/policy.json \
  --output receipt.json

pnpm degrade verify receipt.json \
  --plan examples/resilient-plan.json \
  --policy examples/policy.json
```

Exit codes are `0` for clean, `2` for blocked, `3` for review, `4` for an invalid receipt, and `5` for invalid input.

## Studio

The local Studio displays the route topology, workload × outage matrix, failure-domain diversity, fallback activation count, reachability debt, and contract findings.

```bash
pnpm dev
```

Switch between the resilient and brittle example architectures. The Studio does not send inference traffic or upload configuration.

## Evaluation semantics

Fallback IDs are ordered. During a scenario, DegradeProof:

1. starts at the workload primary route;
2. marks routes unavailable by endpoint, provider, or region;
3. follows fallback edges left to right;
4. chooses the first available route;
5. evaluates that route against the workload contract.

The compiler deliberately does not skip an available but unsafe route. That is the hidden production behavior it is designed to expose.

See [plan format](docs/PLAN.md) and [policy reference](docs/POLICY.md).

## Design boundary

DegradeProof compiles declared routing metadata. It does not call providers, measure live latency, benchmark model quality, transfer conversation state, or configure an actual load balancer. Feed it values from trusted evaluations and deployment telemetry, then keep runtime routing order aligned with the compiled plan.

## Research and standards context

- NIST, [*Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=958388)
- Google Cloud, [*AI and ML perspective: Reliability*](https://docs.cloud.google.com/architecture/framework/perspectives/ai-ml/reliability)
- Pandey and Singh, [*ContinuityBench: A Benchmark and Systems Study of Stateful Failover in Multi-Provider LLM Routing*](https://arxiv.org/abs/2607.15899)
- Wu et al., [*Privacy-Preserving LLMs Routing*](https://arxiv.org/abs/2604.15728)

These references motivate the failure mode. DegradeProof is an independent open-source implementation and is not affiliated with the authors or publishers.

## Development

```bash
pnpm check
```

This runs linting, strict TypeScript checks, unit tests, and production builds for the compiler, CLI, and Studio.

## License

[MIT](LICENSE)

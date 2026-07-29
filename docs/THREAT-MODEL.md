# Threat model

## Protected properties

DegradeProof is designed to reveal declared failover paths that preserve availability while violating a workload contract.

It addresses:

- unavailable or cyclic fallback routes;
- correlated provider and region failure;
- data-class, residency, and retention regression;
- capability, context, quality, latency, and cost regression;
- state discontinuity;
- configuration changes after compilation.

## Trust assumptions

The compiler trusts route metadata, evaluation scores, telemetry summaries, workload contracts, outage scenarios, and local execution. It assumes runtime route ordering matches the plan.

## Out of scope

- Live provider health checks or traffic routing
- Measuring model accuracy, latency, or cost
- Detecting provider-side retention behavior
- Transferring or transforming conversation state
- Prompt injection, output safety, and content moderation
- Provider contract interpretation
- Cryptographic publisher identity
- Guaranteeing that configured failure scenarios are exhaustive

## Recommended deployment

Generate configuration from a controlled source, use real failure-domain identifiers, test correlated outages, validate measurements regularly, keep workload contracts version-controlled, sign receipts externally, and compare runtime route selections with compiled outcomes.

# Plan format

A failover plan contains routes and workload contracts.

```json
{
  "planVersion": "1.0",
  "systemId": "customer-ai",
  "routes": [],
  "workloads": []
}
```

## Route

```json
{
  "id": "orbit-secondary",
  "provider": "cloud-b",
  "model": "orbit-plus",
  "region": "us-west",
  "residency": "US",
  "capabilities": ["chat", "json", "tools"],
  "acceptedDataClasses": ["public", "internal", "confidential", "restricted"],
  "contextWindow": 96000,
  "qualityScore": 89,
  "p95LatencyMs": 1400,
  "costPer1kTokens": 0.035,
  "retainsInput": false,
  "preservesConversationState": true,
  "fallbackIds": ["local-enclave"]
}
```

`fallbackIds` is ordered. The first available route wins even when a later route would satisfy more invariants.

`qualityScore` is an organization-defined score from 0 to 100. Use one evaluation methodology across all routes. Cost units must also be consistent.

## Workload contract

```json
{
  "id": "automation-agent",
  "primaryRouteId": "atlas-primary",
  "dataClass": "restricted",
  "requiredCapabilities": ["chat", "json", "tools"],
  "allowedResidencies": ["US"],
  "allowedProviders": ["cloud-a", "cloud-b", "self-hosted"],
  "minimumContextWindow": 64000,
  "minimumQualityScore": 82,
  "maximumP95LatencyMs": 2800,
  "maximumCostPer1kTokens": 0.05,
  "allowInputRetention": false,
  "requireConversationState": true
}
```

An empty `allowedProviders` array means any provider is permitted. Residency allowlists are always enforced.

Data classes are `public`, `internal`, `confidential`, and `restricted`.

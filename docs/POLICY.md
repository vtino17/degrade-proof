# Policy reference

```json
{
  "policyVersion": "1.0",
  "systemId": "customer-ai",
  "maximumFallbackHops": 3,
  "minimumProviderDiversity": 3,
  "minimumRegionDiversity": 3,
  "requireAllScenariosPass": true,
  "scenarios": [
    {
      "id": "primary-provider-outage",
      "description": "The primary cloud provider is unavailable.",
      "unavailableRouteIds": [],
      "unavailableProviders": ["cloud-a"],
      "unavailableRegions": []
    }
  ]
}
```

## Graph controls

- `maximumFallbackHops` prevents deep, difficult-to-reason-about degradation chains.
- `minimumProviderDiversity` checks providers reachable from workload primary routes.
- `minimumRegionDiversity` checks reachable deployment regions.
- `requireAllScenariosPass` determines whether an uncovered scenario is blocked or review-only.

Structural problems such as cycles, orphan routes, and contract violations remain blocked independently.

## Scenarios

A scenario can make individual routes, entire providers, and entire regions unavailable at once. These dimensions are combined with logical OR.

Include:

- steady state;
- every primary route failure;
- each external provider outage;
- every material region outage;
- correlated failures that the architecture claims to survive;
- quota exhaustion or planned maintenance represented as route/provider unavailability.

DegradeProof evaluates every workload against every scenario.

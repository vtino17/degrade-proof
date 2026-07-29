import { hashValue } from "./canonical.js";
import type {
  DegradationCompilation,
  DegradationFinding,
  InferenceRoute,
  OutageScenario,
  ScenarioOutcome,
  WorkloadContract,
} from "./types.js";
import { assertPlan, assertPolicy } from "./validation.js";

const finding = (
  code: string,
  severity: DegradationFinding["severity"],
  message: string,
  options: {
    workloadId?: string;
    scenarioId?: string;
    routeId?: string;
    relatedIds?: string[];
  } = {},
): DegradationFinding => ({
  code,
  severity,
  message,
  ...(options.workloadId ? { workloadId: options.workloadId } : {}),
  ...(options.scenarioId ? { scenarioId: options.scenarioId } : {}),
  ...(options.routeId ? { routeId: options.routeId } : {}),
  relatedIds: options.relatedIds ?? [],
});

const unavailable = (route: InferenceRoute, scenario: OutageScenario): boolean =>
  scenario.unavailableRouteIds.includes(route.id)
  || scenario.unavailableProviders.includes(route.provider)
  || scenario.unavailableRegions.includes(route.region);

export async function compileDegradation(input: {
  plan: unknown;
  policy: unknown;
  compiledAt?: Date;
}): Promise<DegradationCompilation> {
  assertPlan(input.plan);
  assertPolicy(input.policy);
  const { plan, policy } = input;
  if (plan.systemId !== policy.systemId) {
    throw new Error("Plan and policy target different systems.");
  }
  const byId = new Map(plan.routes.map((route) => [route.id, route]));
  const globalFindings: DegradationFinding[] = [];

  for (const route of plan.routes) {
    const missing = route.fallbackIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      globalFindings.push(finding(
        "orphan-fallback",
        "blocked",
        "One or more fallback routes do not exist.",
        { routeId: route.id, relatedIds: missing },
      ));
    }
  }
  for (const workload of plan.workloads) {
    if (!byId.has(workload.primaryRouteId)) {
      globalFindings.push(finding(
        "primary-route-missing",
        "blocked",
        "The workload primary route does not exist.",
        { workloadId: workload.id, relatedIds: [workload.primaryRouteId] },
      ));
    }
  }

  const hasCycle = (id: string, stack: string[] = [], done = new Set<string>()): boolean => {
    if (stack.includes(id)) return true;
    if (done.has(id)) return false;
    const route = byId.get(id);
    if (!route) return false;
    const found = route.fallbackIds.some((fallback) =>
      hasCycle(fallback, [...stack, id], done));
    done.add(id);
    return found;
  };
  for (const route of plan.routes) {
    if (hasCycle(route.id)) {
      globalFindings.push(finding(
        "fallback-cycle",
        "blocked",
        "The route participates in a fallback cycle.",
        { routeId: route.id, relatedIds: route.fallbackIds },
      ));
    }
  }

  const reachableBy = new Map<string, Set<string>>();
  const visit = (id: string, workloadId: string, visited = new Set<string>()): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const route = byId.get(id);
    if (!route) return;
    const workloads = reachableBy.get(id) ?? new Set<string>();
    workloads.add(workloadId);
    reachableBy.set(id, workloads);
    for (const fallback of route.fallbackIds) visit(fallback, workloadId, visited);
  };
  for (const workload of plan.workloads) visit(workload.primaryRouteId, workload.id);
  const unreachable = plan.routes.filter((route) => !reachableBy.has(route.id));
  for (const route of unreachable) {
    globalFindings.push(finding(
      "unreachable-route",
      "warning",
      "No workload can reach this route from its primary chain.",
      { routeId: route.id },
    ));
  }

  const reachableRoutes = plan.routes.filter((route) => reachableBy.has(route.id));
  const providers = new Set(reachableRoutes.map((route) => route.provider));
  const regions = new Set(reachableRoutes.map((route) => route.region));
  if (providers.size < policy.minimumProviderDiversity) {
    globalFindings.push(finding(
      "provider-diversity-insufficient",
      "blocked",
      `Reachable routes span ${providers.size} providers; ${policy.minimumProviderDiversity} required.`,
      { relatedIds: [...providers].sort() },
    ));
  }
  if (regions.size < policy.minimumRegionDiversity) {
    globalFindings.push(finding(
      "region-diversity-insufficient",
      "blocked",
      `Reachable routes span ${regions.size} regions; ${policy.minimumRegionDiversity} required.`,
      { relatedIds: [...regions].sort() },
    ));
  }

  const knownTargets = new Set(plan.routes.flatMap((route) => [
    route.id,
    route.provider,
    route.region,
  ]));
  for (const scenario of policy.scenarios) {
    const unknown = [
      ...scenario.unavailableRouteIds,
      ...scenario.unavailableProviders,
      ...scenario.unavailableRegions,
    ].filter((target) => !knownTargets.has(target));
    if (unknown.length > 0) {
      globalFindings.push(finding(
        "scenario-target-unknown",
        "warning",
        "The scenario references outage targets absent from the plan.",
        { scenarioId: scenario.id, relatedIds: unknown },
      ));
    }
  }

  const select = (
    routeId: string,
    scenario: OutageScenario,
    path: string[] = [],
  ): { route?: InferenceRoute; path: string[] } => {
    if (path.includes(routeId) || path.length > policy.maximumFallbackHops + 1) {
      return { path: [...path, routeId] };
    }
    const route = byId.get(routeId);
    if (!route) return { path: [...path, routeId] };
    const nextPath = [...path, routeId];
    if (!unavailable(route, scenario)) return { route, path: nextPath };
    let lastAttempt: { route?: InferenceRoute; path: string[] } = { path: nextPath };
    for (const fallback of route.fallbackIds) {
      const selected = select(fallback, scenario, nextPath);
      if (selected.route) return selected;
      lastAttempt = selected;
    }
    return lastAttempt;
  };

  const evaluate = (
    workload: WorkloadContract,
    scenario: OutageScenario,
  ): ScenarioOutcome => {
    const selected = select(workload.primaryRouteId, scenario);
    const route = selected.route;
    const fallbackHops = Math.max(0, selected.path.length - 1);
    const findings: DegradationFinding[] = [];
    const options = {
      workloadId: workload.id,
      scenarioId: scenario.id,
      ...(route ? { routeId: route.id } : {}),
    };
    if (!route) {
      findings.push(finding(
        "no-surviving-route",
        policy.requireAllScenariosPass ? "blocked" : "warning",
        "No available route survives this outage scenario.",
        { ...options, relatedIds: selected.path },
      ));
    } else {
      if (!route.acceptedDataClasses.includes(workload.dataClass)) {
        findings.push(finding(
          "data-class-not-accepted",
          "blocked",
          `Route does not accept ${workload.dataClass} data.`,
          options,
        ));
      }
      if (!workload.allowedResidencies.includes(route.residency)) {
        findings.push(finding(
          "residency-violation",
          "blocked",
          `Residency "${route.residency}" is outside the workload allowlist.`,
          options,
        ));
      }
      if (
        workload.allowedProviders.length > 0
        && !workload.allowedProviders.includes(route.provider)
      ) {
        findings.push(finding(
          "provider-not-approved",
          "blocked",
          `Provider "${route.provider}" is outside the workload allowlist.`,
          options,
        ));
      }
      const missingCapabilities = workload.requiredCapabilities.filter((capability) =>
        !route.capabilities.includes(capability));
      if (missingCapabilities.length > 0) {
        findings.push(finding(
          "capability-loss",
          "blocked",
          "Fallback route loses required capabilities.",
          { ...options, relatedIds: missingCapabilities },
        ));
      }
      if (route.contextWindow < workload.minimumContextWindow) {
        findings.push(finding(
          "context-window-breach",
          "blocked",
          `Context window ${route.contextWindow} is below ${workload.minimumContextWindow}.`,
          options,
        ));
      }
      if (route.qualityScore < workload.minimumQualityScore) {
        findings.push(finding(
          "quality-floor-breach",
          "blocked",
          `Quality score ${route.qualityScore} is below ${workload.minimumQualityScore}.`,
          options,
        ));
      }
      if (route.p95LatencyMs > workload.maximumP95LatencyMs) {
        findings.push(finding(
          "latency-budget-breach",
          "blocked",
          `P95 latency ${route.p95LatencyMs}ms exceeds ${workload.maximumP95LatencyMs}ms.`,
          options,
        ));
      }
      if (route.costPer1kTokens > workload.maximumCostPer1kTokens) {
        findings.push(finding(
          "cost-budget-breach",
          "blocked",
          `Cost ${route.costPer1kTokens} exceeds ${workload.maximumCostPer1kTokens} per 1k tokens.`,
          options,
        ));
      }
      if (route.retainsInput && !workload.allowInputRetention) {
        findings.push(finding(
          "retention-regression",
          "blocked",
          "Fallback route retains input for a workload that forbids retention.",
          options,
        ));
      }
      if (workload.requireConversationState && !route.preservesConversationState) {
        findings.push(finding(
          "conversation-state-loss",
          "blocked",
          "Fallback route cannot preserve required conversation state.",
          options,
        ));
      }
    }
    if (fallbackHops > policy.maximumFallbackHops) {
      findings.push(finding(
        "fallback-depth-exceeded",
        "blocked",
        `Fallback path uses ${fallbackHops} hops; ${policy.maximumFallbackHops} allowed.`,
        { ...options, relatedIds: selected.path },
      ));
    }
    const blocked = findings.some((item) => item.severity === "blocked");
    return {
      workloadId: workload.id,
      scenarioId: scenario.id,
      status: blocked ? "fail" : fallbackHops > 0 || findings.length > 0 ? "degraded" : "pass",
      ...(route ? { selectedRouteId: route.id } : {}),
      path: selected.path,
      fallbackHops,
      findings,
    };
  };

  const outcomes = plan.workloads.flatMap((workload) =>
    policy.scenarios.map((scenario) => evaluate(workload, scenario)));
  const allFindings = [
    ...globalFindings,
    ...outcomes.flatMap((outcome) => outcome.findings),
  ];
  const blocked = allFindings.filter((item) => item.severity === "blocked").length;
  const warnings = allFindings.filter((item) => item.severity === "warning").length;
  const passed = outcomes.filter((outcome) => outcome.status === "pass").length;
  const degraded = outcomes.filter((outcome) => outcome.status === "degraded").length;
  const failed = outcomes.filter((outcome) => outcome.status === "fail").length;
  const base = {
    systemId: plan.systemId,
    status: blocked > 0 ? "blocked" as const : warnings > 0 ? "review" as const : "clean" as const,
    score: Math.max(0, 100 - blocked * 8 - warnings * 3),
    compiledAt: (input.compiledAt ?? new Date()).toISOString(),
    summary: {
      workloads: plan.workloads.length,
      scenarios: policy.scenarios.length,
      outcomes: outcomes.length,
      passed,
      degraded,
      failed,
    },
    metrics: {
      scenarioPassRate: outcomes.length === 0 ? 1 : (passed + degraded) / outcomes.length,
      fallbackActivations: outcomes.filter((outcome) => outcome.fallbackHops > 0).length,
      maximumObservedHops: Math.max(0, ...outcomes.map((outcome) => outcome.fallbackHops)),
      providerDiversity: providers.size,
      regionDiversity: regions.size,
      routes: plan.routes.length,
      unreachableRoutes: unreachable.length,
    },
    outcomes,
    findings: globalFindings,
    graph: {
      nodes: plan.routes.map((route) => ({
        ...route,
        reachableBy: [...(reachableBy.get(route.id) ?? [])].sort(),
      })).sort((left, right) => left.id.localeCompare(right.id)),
      edges: plan.routes.flatMap((route) =>
        route.fallbackIds.map((fallback, order) => ({ from: route.id, to: fallback, order })))
        .sort((left, right) =>
          `${left.from}:${left.order}:${left.to}`.localeCompare(`${right.from}:${right.order}:${right.to}`)),
    },
  };
  return { ...base, compilationHash: await hashValue(base) };
}

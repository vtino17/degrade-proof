import type {
  DegradationPolicy,
  FailoverPlan,
} from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export function assertPlan(value: unknown): asserts value is FailoverPlan {
  if (
    !isObject(value)
    || value.planVersion !== "1.0"
    || typeof value.systemId !== "string"
    || !Array.isArray(value.routes)
    || !Array.isArray(value.workloads)
  ) throw new Error("Invalid failover plan.");
  const routeIds = new Set<string>();
  for (const route of value.routes) {
    if (!isObject(route)) throw new Error("Route must be an object.");
    for (const field of ["id", "provider", "model", "region", "residency"]) {
      if (typeof route[field] !== "string" || route[field] === "") {
        throw new Error(`Route field "${field}" must be a non-empty string.`);
      }
    }
    for (const field of ["capabilities", "acceptedDataClasses", "fallbackIds"]) {
      if (!stringArray(route[field])) throw new Error(`${field} must be an array of strings.`);
    }
    for (const field of [
      "contextWindow", "qualityScore", "p95LatencyMs", "costPer1kTokens",
    ]) {
      if (typeof route[field] !== "number" || Number(route[field]) < 0) {
        throw new Error(`${field} must be non-negative.`);
      }
    }
    if (Number(route.qualityScore) > 100) throw new Error("qualityScore cannot exceed 100.");
    for (const field of ["retainsInput", "preservesConversationState"]) {
      if (typeof route[field] !== "boolean") throw new Error(`${field} must be boolean.`);
    }
    const id = String(route.id);
    if (routeIds.has(id)) throw new Error(`Duplicate route id: ${id}`);
    routeIds.add(id);
  }
  const workloadIds = new Set<string>();
  for (const workload of value.workloads) {
    if (!isObject(workload)) throw new Error("Workload must be an object.");
    for (const field of ["id", "primaryRouteId", "dataClass"]) {
      if (typeof workload[field] !== "string" || workload[field] === "") {
        throw new Error(`Workload field "${field}" must be a non-empty string.`);
      }
    }
    for (const field of ["requiredCapabilities", "allowedResidencies", "allowedProviders"]) {
      if (!stringArray(workload[field])) throw new Error(`${field} must be an array of strings.`);
    }
    for (const field of [
      "minimumContextWindow", "minimumQualityScore",
      "maximumP95LatencyMs", "maximumCostPer1kTokens",
    ]) {
      if (typeof workload[field] !== "number" || Number(workload[field]) < 0) {
        throw new Error(`${field} must be non-negative.`);
      }
    }
    for (const field of ["allowInputRetention", "requireConversationState"]) {
      if (typeof workload[field] !== "boolean") throw new Error(`${field} must be boolean.`);
    }
    const id = String(workload.id);
    if (workloadIds.has(id)) throw new Error(`Duplicate workload id: ${id}`);
    workloadIds.add(id);
  }
}

export function assertPolicy(value: unknown): asserts value is DegradationPolicy {
  if (
    !isObject(value)
    || value.policyVersion !== "1.0"
    || typeof value.systemId !== "string"
    || !Array.isArray(value.scenarios)
  ) throw new Error("Invalid degradation policy.");
  for (const field of [
    "maximumFallbackHops", "minimumProviderDiversity", "minimumRegionDiversity",
  ]) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }
  if (typeof value.requireAllScenariosPass !== "boolean") {
    throw new Error("requireAllScenariosPass must be boolean.");
  }
  const ids = new Set<string>();
  for (const scenario of value.scenarios) {
    if (
      !isObject(scenario)
      || typeof scenario.id !== "string"
      || typeof scenario.description !== "string"
    ) throw new Error("Invalid outage scenario.");
    for (const field of ["unavailableRouteIds", "unavailableProviders", "unavailableRegions"]) {
      if (!stringArray(scenario[field])) throw new Error(`${field} must be an array of strings.`);
    }
    if (ids.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);
  }
}

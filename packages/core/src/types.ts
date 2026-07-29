export type DataClass = "public" | "internal" | "confidential" | "restricted";

export interface InferenceRoute {
  id: string;
  provider: string;
  model: string;
  region: string;
  residency: string;
  capabilities: string[];
  acceptedDataClasses: DataClass[];
  contextWindow: number;
  qualityScore: number;
  p95LatencyMs: number;
  costPer1kTokens: number;
  retainsInput: boolean;
  preservesConversationState: boolean;
  fallbackIds: string[];
}

export interface WorkloadContract {
  id: string;
  primaryRouteId: string;
  dataClass: DataClass;
  requiredCapabilities: string[];
  allowedResidencies: string[];
  allowedProviders: string[];
  minimumContextWindow: number;
  minimumQualityScore: number;
  maximumP95LatencyMs: number;
  maximumCostPer1kTokens: number;
  allowInputRetention: boolean;
  requireConversationState: boolean;
}

export interface FailoverPlan {
  planVersion: "1.0";
  systemId: string;
  routes: InferenceRoute[];
  workloads: WorkloadContract[];
}

export interface OutageScenario {
  id: string;
  description: string;
  unavailableRouteIds: string[];
  unavailableProviders: string[];
  unavailableRegions: string[];
}

export interface DegradationPolicy {
  policyVersion: "1.0";
  systemId: string;
  maximumFallbackHops: number;
  minimumProviderDiversity: number;
  minimumRegionDiversity: number;
  requireAllScenariosPass: boolean;
  scenarios: OutageScenario[];
}

export interface DegradationFinding {
  code: string;
  severity: "warning" | "blocked";
  message: string;
  workloadId?: string;
  scenarioId?: string;
  routeId?: string;
  relatedIds: string[];
}

export interface ScenarioOutcome {
  workloadId: string;
  scenarioId: string;
  status: "pass" | "degraded" | "fail";
  selectedRouteId?: string;
  path: string[];
  fallbackHops: number;
  findings: DegradationFinding[];
}

export interface RouteNode extends InferenceRoute {
  reachableBy: string[];
}

export interface DegradationCompilation {
  systemId: string;
  status: "clean" | "review" | "blocked";
  score: number;
  compiledAt: string;
  summary: {
    workloads: number;
    scenarios: number;
    outcomes: number;
    passed: number;
    degraded: number;
    failed: number;
  };
  metrics: {
    scenarioPassRate: number;
    fallbackActivations: number;
    maximumObservedHops: number;
    providerDiversity: number;
    regionDiversity: number;
    routes: number;
    unreachableRoutes: number;
  };
  outcomes: ScenarioOutcome[];
  findings: DegradationFinding[];
  graph: {
    nodes: RouteNode[];
    edges: Array<{ from: string; to: string; order: number }>;
  };
  compilationHash: string;
}

export interface DegradationReceipt {
  receiptVersion: "1.0";
  systemId: string;
  planHash: string;
  policyHash: string;
  compilationHash: string;
  compiledAt: string;
  issuedAt: string;
  passedOutcomeIds: string[];
  receiptHash: string;
}

export interface ReceiptVerification {
  valid: boolean;
  checks: Record<"receiptHash" | "planHash" | "policyHash" | "compilationHash", boolean>;
  errors: string[];
}

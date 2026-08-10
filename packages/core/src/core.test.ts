import { describe, expect, it } from "vitest";
import {
  brittlePlan,
  compileDegradation,
  issueReceipt,
  resilientPlan,
  samplePolicy,
  verifyReceipt,
} from "./index.js";
import type {
  DegradationPolicy,
  FailoverPlan,
} from "./types.js";

const compile = (
  plan: FailoverPlan = resilientPlan,
  policy: DegradationPolicy = samplePolicy,
) => compileDegradation({
  plan,
  policy,
  compiledAt: new Date("2026-07-29T00:00:00.000Z"),
});

const codes = async (plan: FailoverPlan, policy = samplePolicy) => {
  const result = await compile(plan, policy);
  return [
    ...result.findings,
    ...result.outcomes.flatMap((outcome) => outcome.findings),
  ].map((item) => item.code);
};

const mutable = (): FailoverPlan => structuredClone(resilientPlan);

describe("degradation compiler", () => {
  it("compiles a resilient plan cleanly", async () => expect((await compile()).status).toBe("clean"));
  it("evaluates every workload and scenario", async () => expect((await compile()).summary.outcomes).toBe(10));
  it("passes every resilient outcome", async () => expect((await compile()).metrics.scenarioPassRate).toBe(1));
  it("uses the primary route in steady state", async () => {
    const outcome = (await compile()).outcomes.find((item) => item.scenarioId === "steady-state");
    expect(outcome?.selectedRouteId).toBe("atlas-primary");
  });
  it("selects the secondary during primary route outage", async () => {
    const outcome = (await compile()).outcomes.find((item) =>
      item.scenarioId === "primary-model-outage" && item.workloadId === "support-assistant");
    expect(outcome?.selectedRouteId).toBe("orbit-secondary");
  });
  it("selects the local enclave during dual cloud outage", async () => {
    const outcome = (await compile()).outcomes.find((item) =>
      item.scenarioId === "dual-cloud-outage" && item.workloadId === "automation-agent");
    expect(outcome?.selectedRouteId).toBe("local-enclave");
  });
  it("preserves ordered fallback paths", async () => {
    const outcome = (await compile()).outcomes.find((item) =>
      item.scenarioId === "dual-cloud-outage" && item.workloadId === "support-assistant");
    expect(outcome?.path).toEqual(["atlas-primary", "orbit-secondary", "local-enclave"]);
  });
  it("measures provider diversity", async () => expect((await compile()).metrics.providerDiversity).toBe(3));
  it("measures region diversity", async () => expect((await compile()).metrics.regionDiversity).toBe(3));
  it("builds ordered graph edges", async () => {
    expect((await compile()).graph.edges).toContainEqual({ from: "atlas-primary", to: "orbit-secondary", order: 0 });
  });
  it("detects orphan fallbacks", async () => expect(await codes(brittlePlan)).toContain("orphan-fallback"));
  it("detects fallback cycles", async () => expect(await codes(brittlePlan)).toContain("fallback-cycle"));
  it("detects unreachable routes", async () => expect(await codes(brittlePlan)).toContain("unreachable-route"));
  it("detects insufficient provider diversity", async () => expect(await codes(brittlePlan)).toContain("provider-diversity-insufficient"));
  it("detects insufficient region diversity", async () => expect(await codes(brittlePlan)).toContain("region-diversity-insufficient"));
  it("detects unavailable surviving routes", async () => expect(await codes(brittlePlan)).toContain("no-surviving-route"));
  it("detects data classification regression", async () => expect(await codes(brittlePlan)).toContain("data-class-not-accepted"));
  it("detects residency violations", async () => expect(await codes(brittlePlan)).toContain("residency-violation"));
  it("detects lost capabilities", async () => expect(await codes(brittlePlan)).toContain("capability-loss"));
  it("detects context window regression", async () => expect(await codes(brittlePlan)).toContain("context-window-breach"));
  it("detects quality floor breach", async () => expect(await codes(brittlePlan)).toContain("quality-floor-breach"));
  it("detects latency budget breach", async () => expect(await codes(brittlePlan)).toContain("latency-budget-breach"));
  it("detects cost budget breach", async () => expect(await codes(brittlePlan)).toContain("cost-budget-breach"));
  it("detects retention regression", async () => expect(await codes(brittlePlan)).toContain("retention-regression"));
  it("detects conversation state loss", async () => expect(await codes(brittlePlan)).toContain("conversation-state-loss"));
  it("blocks a brittle plan", async () => expect((await compile(brittlePlan)).status).toBe("blocked"));
  it("detects an unapproved provider", async () => {
    const plan = mutable();
    plan.workloads[0]!.allowedProviders = ["cloud-a"];
    expect(await codes(plan)).toContain("provider-not-approved");
  });
  it("detects a missing primary route", async () => {
    const plan = mutable();
    plan.workloads[0]!.primaryRouteId = "missing";
    expect(await codes(plan)).toContain("primary-route-missing");
  });
  it("warns about unknown scenario targets", async () => {
    const policy = structuredClone(samplePolicy);
    policy.scenarios[0]!.unavailableRouteIds = ["not-in-plan"];
    expect(await codes(resilientPlan, policy)).toContain("scenario-target-unknown");
  });
  it("can treat uncovered scenarios as review-only", async () => {
    const policy = { ...samplePolicy, requireAllScenariosPass: false };
    const result = await compile(brittlePlan, policy);
    const finding = result.outcomes.flatMap((item) => item.findings).find((item) => item.code === "no-surviving-route");
    expect(finding?.severity).toBe("warning");
  });
  it("detects excessive fallback depth", async () => {
    const policy = { ...samplePolicy, maximumFallbackHops: 1 };
    expect(await codes(resilientPlan, policy)).toContain("fallback-depth-exceeded");
  });
  it("rejects mismatched system ids", async () => {
    await expect(compileDegradation({
      plan: resilientPlan,
      policy: { ...samplePolicy, systemId: "other" },
    })).rejects.toThrow("different systems");
  });
  it("rejects duplicate route ids", async () => {
    const plan = mutable();
    plan.routes.push(structuredClone(plan.routes[0]!));
    await expect(compile(plan)).rejects.toThrow("Duplicate route id");
  });
  it("rejects invalid quality score", async () => {
    const plan = mutable();
    plan.routes[0]!.qualityScore = 101;
    await expect(compile(plan)).rejects.toThrow("cannot exceed");
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite route metrics (%s)",
    async (costPer1kTokens) => {
      const plan = mutable();
      plan.routes[0]!.costPer1kTokens = costPer1kTokens;
      await expect(compile(plan)).rejects.toThrow("costPer1kTokens must be finite");
    },
  );
  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite workload budgets (%s)",
    async (maximumCostPer1kTokens) => {
      const plan = mutable();
      plan.workloads[0]!.maximumCostPer1kTokens = maximumCostPer1kTokens;
      await expect(compile(plan)).rejects.toThrow("maximumCostPer1kTokens must be finite");
    },
  );
});

describe("degradation receipts", () => {
  it("issues a receipt for a resilient plan", async () => {
    const receipt = await issueReceipt({ plan: resilientPlan, policy: samplePolicy });
    expect(receipt.receiptHash).toHaveLength(64);
  });
  it("verifies matching inputs", async () => {
    const receipt = await issueReceipt({ plan: resilientPlan, policy: samplePolicy });
    expect((await verifyReceipt(receipt, { plan: resilientPlan, policy: samplePolicy })).valid).toBe(true);
  });
  it("detects receipt tampering", async () => {
    const receipt = await issueReceipt({ plan: resilientPlan, policy: samplePolicy });
    const tampered = { ...receipt, passedOutcomeIds: ["forged"] };
    expect((await verifyReceipt(tampered, { plan: resilientPlan, policy: samplePolicy })).checks.receiptHash).toBe(false);
  });
  it("detects changed source inputs", async () => {
    const receipt = await issueReceipt({ plan: resilientPlan, policy: samplePolicy });
    const changed = mutable();
    changed.routes[0]!.qualityScore = 95;
    expect((await verifyReceipt(receipt, { plan: changed, policy: samplePolicy })).valid).toBe(false);
  });
  it("refuses a blocked plan", async () => {
    await expect(issueReceipt({ plan: brittlePlan, policy: samplePolicy })).rejects.toThrow("blocked");
  });
});

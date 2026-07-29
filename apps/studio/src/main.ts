import {
  brittlePlan,
  compileDegradation,
  resilientPlan,
  samplePolicy,
  type DegradationCompilation,
  type FailoverPlan,
} from "@degradeproof/core";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
let selected: "resilient" | "brittle" = "resilient";

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function topology(result: DegradationCompilation): string {
  const outcomeRoutes = new Set(result.outcomes.flatMap((outcome) => outcome.path));
  return result.graph.nodes.map((route, index) => {
    const used = outcomeRoutes.has(route.id);
    return `<article class="route ${used ? "used" : "unused"}" style="--i:${index}">
      <div class="route-head"><span>${escapeHtml(route.provider)}</span><i>${escapeHtml(route.region)}</i></div>
      <strong>${escapeHtml(route.id)}</strong>
      <small>${escapeHtml(route.model)}</small>
      <div class="route-data">
        <span><b>${route.qualityScore}</b> quality</span>
        <span><b>${route.contextWindow / 1000}k</b> context</span>
        <span><b>${route.p95LatencyMs}</b> ms</span>
      </div>
      <p>${route.fallbackIds.length > 0 ? `Fallback → ${route.fallbackIds.map(escapeHtml).join(", ")}` : "Terminal route"}</p>
    </article>`;
  }).join("");
}

function matrix(result: DegradationCompilation): string {
  const scenarios = [...new Set(result.outcomes.map((outcome) => outcome.scenarioId))];
  const workloads = [...new Set(result.outcomes.map((outcome) => outcome.workloadId))];
  return `<div class="matrix-grid" style="--cols:${scenarios.length}">
    <div class="matrix-corner">WORKLOAD / FAILURE</div>
    ${scenarios.map((scenario) => `<div class="scenario-label">${escapeHtml(scenario.replaceAll("-", " "))}</div>`).join("")}
    ${workloads.map((workload) => `
      <div class="workload-label"><strong>${escapeHtml(workload)}</strong><span>contract</span></div>
      ${scenarios.map((scenario) => {
        const outcome = result.outcomes.find((item) =>
          item.workloadId === workload && item.scenarioId === scenario);
        if (!outcome) return `<div class="outcome fail">missing</div>`;
        return `<div class="outcome ${outcome.status}">
          <i></i><strong>${outcome.status}</strong>
          <span>${escapeHtml(outcome.selectedRouteId ?? "no route")}</span>
          <small>${outcome.fallbackHops} hop${outcome.fallbackHops === 1 ? "" : "s"}</small>
        </div>`;
      }).join("")}`).join("")}
  </div>`;
}

function findings(result: DegradationCompilation): string {
  const items = [
    ...result.findings,
    ...result.outcomes.flatMap((outcome) => outcome.findings),
  ];
  if (items.length === 0) {
    return `<div class="empty"><span>✓</span><strong>Every degradation contract holds</strong><p>All configured outages preserve privacy, residency, capability, continuity, quality, latency, and cost invariants.</p></div>`;
  }
  return items.map((item) => `<article class="finding ${item.severity}">
    <div><code>${escapeHtml(item.code)}</code><span>${item.severity}</span></div>
    <strong>${escapeHtml([item.workloadId, item.scenarioId, item.routeId].filter(Boolean).join(" · ") || "Graph policy")}</strong>
    <p>${escapeHtml(item.message)}</p>
    ${item.relatedIds.length > 0 ? `<small>Related: ${item.relatedIds.map(escapeHtml).join(", ")}</small>` : ""}
  </article>`).join("");
}

async function render(plan: FailoverPlan): Promise<void> {
  const result = await compileDegradation({ plan, policy: samplePolicy });
  const totalFindings = result.findings.length
    + result.outcomes.flatMap((outcome) => outcome.findings).length;
  const headline = result.status === "clean"
    ? "Failover proven"
    : result.status === "review"
      ? "Review required"
      : "Fallback unsafe";
  app.innerHTML = `
    <header>
      <a href="#" class="brand"><span>DP</span><div>DegradeProof<small>Continuity compiler</small></div></a>
      <nav><a href="#matrix">Scenario matrix</a><a href="#topology">Routes</a><a href="#findings">Findings</a><a href="https://github.com/vtino17/degrade-proof">GitHub ↗</a></nav>
      <div class="live"><i></i>Simulator ready</div>
    </header>
    <main>
      <section class="hero">
        <div>
          <p class="eyebrow">FAILURE-AWARE AI ROUTING</p>
          <h1>Uptime is not enough.<br><em>Prove the fallback.</em></h1>
          <p>Simulate provider, model, and region outages before production. Verify that every surviving route still honors workload invariants.</p>
        </div>
        <div class="verdict ${result.status}">
          <div class="score"><strong>${result.score}</strong><span>/100</span></div>
          <div><p>DEGRADATION VERDICT</p><h2>${headline}</h2><span>${result.summary.outcomes - result.summary.failed}/${result.summary.outcomes} outcomes safe</span></div>
        </div>
      </section>
      <section class="switcher">
        <div><button data-demo="resilient" class="${selected === "resilient" ? "active" : ""}">Resilient architecture</button><button data-demo="brittle" class="${selected === "brittle" ? "active" : ""}">Brittle architecture</button></div>
        <span>System <strong>${escapeHtml(result.systemId)}</strong> · <code>${result.compilationHash.slice(0, 12)}</code></span>
      </section>
      <section class="metrics">
        <article><p>Scenario coverage</p><strong>${(result.metrics.scenarioPassRate * 100).toFixed(0)}<small>%</small></strong><div class="bar"><i style="width:${result.metrics.scenarioPassRate * 100}%"></i></div><span>${result.summary.failed} failed outcomes</span></article>
        <article><p>Fallback activations</p><strong>${result.metrics.fallbackActivations}</strong><div class="steps">${Array.from({ length: Math.min(10, result.metrics.fallbackActivations) }, () => "<i></i>").join("")}</div><span>Maximum ${result.metrics.maximumObservedHops} hops</span></article>
        <article><p>Failure domains</p><strong>${result.metrics.providerDiversity}<small> providers</small></strong><div class="domains">${Array.from({ length: result.metrics.providerDiversity }, (_, i) => `<i style="--d:${i}"></i>`).join("")}</div><span>${result.metrics.regionDiversity} independent regions</span></article>
        <article><p>Reachability debt</p><strong>${result.metrics.unreachableRoutes}</strong><div class="debt ${result.metrics.unreachableRoutes > 0 ? "alert" : ""}"><i></i></div><span>${result.metrics.routes} declared routes</span></article>
      </section>
      <section class="panel" id="matrix">
        <div class="panel-head"><div><p class="eyebrow">OUTAGE SIMULATION</p><h2>Workload × scenario matrix</h2></div><div class="legend"><span><i class="pass"></i>Pass</span><span><i class="degraded"></i>Fallback</span><span><i class="fail"></i>Fail</span></div></div>
        <div class="matrix-wrap">${matrix(result)}</div>
      </section>
      <section class="panel" id="topology">
        <div class="panel-head"><div><p class="eyebrow">ORDERED ROUTE GRAPH</p><h2>Degradation topology</h2></div><span class="hint">Fallback order is evaluated left to right</span></div>
        <div class="topology">${topology(result)}</div>
      </section>
      <section class="panel" id="findings">
        <div class="panel-head"><div><p class="eyebrow">CONTRACT DIAGNOSTICS</p><h2>Compiler findings</h2></div><span class="hint">${totalFindings} finding${totalFindings === 1 ? "" : "s"}</span></div>
        <div class="findings">${findings(result)}</div>
      </section>
      <footer><span>DegradeProof · policy-safe graceful degradation</span><span>No inference traffic is sent by this Studio</span></footer>
    </main>`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-demo]")) {
    button.addEventListener("click", () => {
      selected = button.dataset.demo === "brittle" ? "brittle" : "resilient";
      void render(selected === "brittle" ? brittlePlan : resilientPlan);
    });
  }
}

void render(resilientPlan);

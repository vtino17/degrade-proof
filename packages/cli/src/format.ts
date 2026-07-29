import type { DegradationCompilation } from "@degradeproof/core";

export function formatCompilation(result: DegradationCompilation): string {
  const lines = [
    `DegradeProof · ${result.systemId}`,
    `${result.status.toUpperCase()} · score ${result.score}/100`,
    `Workloads ${result.summary.workloads} · scenarios ${result.summary.scenarios} · outcomes ${result.summary.outcomes}`,
    `Passed ${result.summary.passed} · degraded ${result.summary.degraded} · failed ${result.summary.failed}`,
    `Coverage ${(result.metrics.scenarioPassRate * 100).toFixed(1)}% · providers ${result.metrics.providerDiversity} · regions ${result.metrics.regionDiversity} · max hops ${result.metrics.maximumObservedHops}`,
  ];
  const findings = [
    ...result.findings,
    ...result.outcomes.flatMap((outcome) => outcome.findings),
  ];
  if (findings.length === 0) lines.push("", "No degradation contract findings.");
  else {
    lines.push("", "Findings");
    for (const item of findings) {
      const target = [item.workloadId, item.scenarioId, item.routeId].filter(Boolean).join(" · ");
      lines.push(`- [${item.severity.toUpperCase()}] ${item.code}${target ? ` · ${target}` : ""}: ${item.message}`);
    }
  }
  return lines.join("\n");
}

export function formatMatrix(result: DegradationCompilation): string {
  const scenarios = [...new Set(result.outcomes.map((outcome) => outcome.scenarioId))];
  const workloads = [...new Set(result.outcomes.map((outcome) => outcome.workloadId))];
  const widths = [Math.max(8, ...workloads.map((item) => item.length)), ...scenarios.map((item) => Math.max(8, item.length))];
  const row = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index] ?? 8)).join("  ");
  const lines = [
    row(["workload", ...scenarios]),
    row(widths.map((width) => "─".repeat(width))),
  ];
  for (const workload of workloads) {
    const cells = scenarios.map((scenario) => {
      const outcome = result.outcomes.find((item) =>
        item.workloadId === workload && item.scenarioId === scenario);
      return outcome ? `${outcome.status}:${outcome.selectedRouteId ?? "none"}` : "missing";
    });
    lines.push(row([workload, ...cells]));
  }
  return lines.join("\n");
}

export function formatDot(result: DegradationCompilation): string {
  const used = new Set(result.outcomes.flatMap((outcome) => outcome.path));
  const nodes = result.graph.nodes.map((node) => {
    const color = used.has(node.id) ? "#d9f65d" : "#68706b";
    return `  "${node.id}" [label="${node.id}\\n${node.provider} · ${node.region}", color="${color}"];`;
  });
  const edges = result.graph.edges.map((edge) =>
    `  "${edge.from}" -> "${edge.to}" [label="${edge.order + 1}"];`);
  return [
    "digraph DegradeProof {",
    "  rankdir=LR;",
    "  node [shape=box, style=rounded];",
    ...nodes,
    ...edges,
    "}",
  ].join("\n");
}

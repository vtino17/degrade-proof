#!/usr/bin/env node
import {
  brittlePlan,
  compileDegradation,
  issueReceipt,
  resilientPlan,
  samplePolicy,
  verifyReceipt,
  type DegradationPolicy,
  type DegradationReceipt,
  type FailoverPlan,
} from "@degradeproof/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { formatCompilation, formatDot, formatMatrix } from "./format.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name: string): boolean => args.includes(name);
const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(resolve(file), "utf8")) as T;
const saveText = async (file: string, content: string): Promise<void> => {
  const target = resolve(file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${content}\n`, "utf8");
};
const saveJson = (file: string, value: unknown) =>
  saveText(file, JSON.stringify(value, null, 2));
const inputs = async () => {
  const planFile = args[1];
  const policyFile = flag("--policy");
  if (!planFile || !policyFile) throw new Error("Provide a plan file plus --policy.");
  return {
    plan: await readJson<FailoverPlan>(planFile),
    policy: await readJson<DegradationPolicy>(policyFile),
  };
};
const statusExit = (status: "clean" | "review" | "blocked") => {
  process.exitCode = status === "blocked" ? 2 : status === "review" ? 3 : 0;
};

const help = `DegradeProof — graceful-degradation contract compiler

Usage:
  degrade-proof inspect <plan.json>
  degrade-proof compile <plan.json> --policy <policy.json> [--json]
  degrade-proof simulate <plan.json> --policy <policy.json> --scenario <id> [--workload <id>]
  degrade-proof matrix <plan.json> --policy <policy.json>
  degrade-proof graph <plan.json> --policy <policy.json> [--output graph.dot]
  degrade-proof receipt <plan.json> --policy <policy.json> --output <receipt.json>
  degrade-proof verify <receipt.json> --plan <plan.json> --policy <policy.json>
  degrade-proof demo [resilient|brittle] [--json]
  degrade-proof init [directory]`;

async function main(): Promise<void> {
  if (command === "help" || has("--help") || has("-h")) return console.log(help);
  if (command === "inspect") {
    const plan = await readJson<FailoverPlan>(args[1] ?? "");
    console.log(JSON.stringify({
      systemId: plan.systemId,
      routes: plan.routes.length,
      workloads: plan.workloads.length,
      providers: [...new Set(plan.routes.map((route) => route.provider))].sort(),
      regions: [...new Set(plan.routes.map((route) => route.region))].sort(),
      edges: plan.routes.reduce((sum, route) => sum + route.fallbackIds.length, 0),
    }, null, 2));
    return;
  }
  if (command === "demo") {
    const result = await compileDegradation({
      plan: args[1] === "brittle" ? brittlePlan : resilientPlan,
      policy: samplePolicy,
    });
    console.log(has("--json") ? JSON.stringify(result, null, 2) : formatCompilation(result));
    statusExit(result.status);
    return;
  }
  if (command === "init") {
    const directory = resolve(args[1] ?? "degrade-proof-example");
    await Promise.all([
      saveJson(`${directory}/resilient-plan.json`, resilientPlan),
      saveJson(`${directory}/brittle-plan.json`, brittlePlan),
      saveJson(`${directory}/policy.json`, samplePolicy),
    ]);
    console.log(`Created starter manifests in ${directory}`);
    return;
  }
  if (command === "verify") {
    const planFile = flag("--plan");
    const policyFile = flag("--policy");
    if (!planFile || !policyFile) throw new Error("Provide --plan and --policy.");
    const result = await verifyReceipt(
      await readJson<DegradationReceipt>(args[1] ?? ""),
      {
        plan: await readJson<FailoverPlan>(planFile),
        policy: await readJson<DegradationPolicy>(policyFile),
      },
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 4;
    return;
  }
  const source = await inputs();
  const result = await compileDegradation(source);
  if (command === "compile") {
    console.log(has("--json") ? JSON.stringify(result, null, 2) : formatCompilation(result));
    statusExit(result.status);
    return;
  }
  if (command === "matrix") {
    console.log(formatMatrix(result));
    statusExit(result.status);
    return;
  }
  if (command === "simulate") {
    const scenarioId = flag("--scenario");
    const workloadId = flag("--workload");
    if (!scenarioId) throw new Error("Provide --scenario <id>.");
    const outcomes = result.outcomes.filter((outcome) =>
      outcome.scenarioId === scenarioId
      && (workloadId === undefined || outcome.workloadId === workloadId));
    if (outcomes.length === 0) throw new Error("No matching scenario outcome.");
    console.log(JSON.stringify(outcomes, null, 2));
    statusExit(result.status);
    return;
  }
  if (command === "graph") {
    const dot = formatDot(result);
    const output = flag("--output");
    if (output) {
      await saveText(output, dot);
      console.log(`Wrote Graphviz fallback graph to ${resolve(output)}`);
    } else console.log(dot);
    statusExit(result.status);
    return;
  }
  if (command === "receipt") {
    const output = flag("--output");
    if (!output) throw new Error("Provide --output <receipt.json>.");
    const receipt = await issueReceipt(source);
    await saveJson(output, receipt);
    console.log(`Issued ${receipt.receiptHash} to ${resolve(output)}`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

main().catch((error: unknown) => {
  console.error(`DegradeProof error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 5;
});

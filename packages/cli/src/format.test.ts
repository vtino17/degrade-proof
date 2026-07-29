import { describe, expect, it } from "vitest";
import {
  compileDegradation,
  resilientPlan,
  samplePolicy,
} from "@degradeproof/core";
import { formatCompilation, formatDot, formatMatrix } from "./format.js";

describe("CLI formatting", () => {
  it("renders a concise resilient report", async () => {
    const result = await compileDegradation({ plan: resilientPlan, policy: samplePolicy });
    expect(formatCompilation(result)).toContain("CLEAN · score 100/100");
  });
  it("renders an outage matrix", async () => {
    const result = await compileDegradation({ plan: resilientPlan, policy: samplePolicy });
    expect(formatMatrix(result)).toContain("dual-cloud-outage");
  });
  it("renders Graphviz fallback edges", async () => {
    const result = await compileDegradation({ plan: resilientPlan, policy: samplePolicy });
    expect(formatDot(result)).toContain('"atlas-primary" -> "orbit-secondary"');
  });
});

import { hashValue } from "./canonical.js";
import { compileDegradation } from "./compile.js";
import type {
  DegradationPolicy,
  DegradationReceipt,
  FailoverPlan,
  ReceiptVerification,
} from "./types.js";

type ReceiptInputs = {
  plan: FailoverPlan;
  policy: DegradationPolicy;
};

export async function issueReceipt(
  input: ReceiptInputs & { issuedAt?: Date },
): Promise<DegradationReceipt> {
  const compilation = await compileDegradation(input);
  if (compilation.status === "blocked") {
    throw new Error("Cannot issue a receipt for a blocked degradation compilation.");
  }
  const body = {
    receiptVersion: "1.0" as const,
    systemId: input.plan.systemId,
    planHash: await hashValue(input.plan),
    policyHash: await hashValue(input.policy),
    compilationHash: compilation.compilationHash,
    compiledAt: compilation.compiledAt,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    passedOutcomeIds: compilation.outcomes
      .filter((outcome) => outcome.status !== "fail")
      .map((outcome) => `${outcome.workloadId}:${outcome.scenarioId}`)
      .sort(),
  };
  return { ...body, receiptHash: await hashValue(body) };
}

export async function verifyReceipt(
  receipt: DegradationReceipt,
  input: ReceiptInputs,
): Promise<ReceiptVerification> {
  const { receiptHash, ...body } = receipt;
  const compilation = await compileDegradation({
    ...input,
    compiledAt: new Date(receipt.compiledAt),
  });
  const checks = {
    receiptHash: receiptHash === await hashValue(body),
    planHash: receipt.planHash === await hashValue(input.plan),
    policyHash: receipt.policyHash === await hashValue(input.policy),
    compilationHash: receipt.compilationHash === compilation.compilationHash,
  };
  const errors = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([name]) => `${name} does not match.`);
  return { valid: errors.length === 0, checks, errors };
}

import { createHash, randomBytes } from "node:crypto";

const RAW_LENGTH = 40;

export function createRecoveryCode() {
  const raw = randomBytes(20).toString("hex").toUpperCase();
  const groups = raw.match(/.{1,5}/g) ?? [raw];
  return `MB-${groups.join("-")}`;
}

export function normalizeRecoveryCode(input: string) {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/^MB[-\s]?/, "")
    .replace(/[-\s]/g, "");

  if (!new RegExp(`^[A-F0-9]{${RAW_LENGTH}}$`).test(compact)) {
    return null;
  }

  return compact;
}

export function recoveryCodeHash(normalizedCode: string) {
  return createHash("sha256")
    .update(`maurilio-access-recovery:${normalizedCode}`)
    .digest("hex");
}


export function accessTag(subjectId: string) {
  return createHash("sha256")
    .update(`maurilio-access-tag:${subjectId}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

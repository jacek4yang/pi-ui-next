// Load-verify the REAL agent configuration (all packages from the user's
// settings.json) without any model call and without reading credentials.
// Usage: node scripts/verify-agent-load.mjs
import assert from "node:assert/strict";

const { DefaultResourceLoader, getAgentDir } = await import("@earendil-works/pi-coding-agent");

const loader = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: getAgentDir() });
await loader.reload();
const { errors, warnings, extensions } = loader.extensionsResult;
console.log("agent dir:", getAgentDir());
console.log(
  "extensions loaded:",
  extensions.length,
  "| errors:",
  errors.length,
  "| warnings:",
  warnings?.length ?? 0,
);
for (const e of errors) console.log("ERROR:", e.path, e.error);
for (const w of warnings ?? []) console.log("WARN:", w.path, w.warning);
assert.equal(errors.length, 0, "extension load errors in real agent config");
console.log("REAL-AGENT-LOAD OK");

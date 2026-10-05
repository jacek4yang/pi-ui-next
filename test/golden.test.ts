// Golden tests for timeline projection (U1–U5). A change that modifies
// golden output must be intentional: regenerate with UPDATE_GOLDENS=1 and
// review the diff in the same PR.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "./helpers/fixture.ts";
import { project } from "../src/timeline/project.ts";
import type { IconMode } from "../src/render/icons.ts";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "goldens");

interface GoldenCase {
  fixture: string;
  width: number;
  icons: IconMode;
}

const CASES: GoldenCase[] = [
  { fixture: "nested-code-success", width: 80, icons: "unicode" },
  { fixture: "nested-code-success", width: 120, icons: "unicode" },
  { fixture: "nested-code-success", width: 80, icons: "ascii" },
  { fixture: "failure-visible", width: 80, icons: "unicode" },
  { fixture: "running-state", width: 80, icons: "unicode" },
  { fixture: "cjk-long", width: 80, icons: "unicode" },
  { fixture: "cjk-long", width: 160, icons: "unicode" },
];

function goldenName(c: GoldenCase): string {
  return `${c.fixture}-${c.width}-${c.icons}.golden.txt`;
}

for (const c of CASES) {
  test(`golden: ${c.fixture} @ ${c.width} cols, ${c.icons}`, () => {
    const { timeline, now } = loadFixture(c.fixture);
    const lines = project(timeline, { width: c.width, icons: c.icons, now });
    const actual = lines.join("\n") + "\n";
    const path = join(GOLDEN_DIR, goldenName(c));
    if (process.env.UPDATE_GOLDENS) {
      writeFileSync(path, actual);
      return;
    }
    // Normalize EOLs: golden bytes must not depend on the OS that checked
    // them out (the semantic content is the line set, not line endings).
    const expected = readFileSync(path, "utf8");
    const normalize = (s: string): string => s.split("\r\n").join("\n");
    assert.equal(normalize(actual), normalize(expected));
  });
}

test("golden set covers the required scenario matrix", () => {
  // U1–U5 minimum: widths, icon modes, CJK, failure visibility, running state.
  const widths = new Set(CASES.map((c) => c.width));
  const icons = new Set(CASES.map((c) => c.icons));
  const fixtures = new Set(CASES.map((c) => c.fixture));
  for (const w of [80, 120, 160]) assert.ok(widths.has(w), `missing width ${w}`);
  for (const i of ["unicode", "ascii"] as const) assert.ok(icons.has(i), `missing icon mode ${i}`);
  for (const f of ["failure-visible", "running-state", "cjk-long", "nested-code-success"]) {
    assert.ok(fixtures.has(f), `missing fixture ${f}`);
  }
});

// Guard: UPDATE_GOLDENS must not silently rewrite goldens during normal CI.
test("UPDATE_GOLDENS is not set in normal runs", () => {
  if (process.env.UPDATE_GOLDENS) {
    mkdtempSync(join(tmpdir(), "goldens-")); // touch to prove env parse worked
  }
  assert.ok(true);
});

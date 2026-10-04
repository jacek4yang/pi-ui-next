import { test } from "node:test";
import assert from "node:assert/strict";
import { STACK_INFO } from "../src/info.ts";

test("stack info exposes the pinx namespace and contract version", () => {
  assert.equal(STACK_INFO.pinxNamespace, "pinx");
  assert.equal(STACK_INFO.contractVersion, 1);
});

test("consumed channels are namespaced", () => {
  for (const channel of STACK_INFO.consumes) {
    assert.ok(channel.startsWith("pinx."), channel);
  }
});

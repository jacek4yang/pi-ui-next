import { test } from "node:test";
import assert from "node:assert/strict";
import { charWidth, padEndToWidth, truncateToWidth, visibleWidth } from "../src/render/width.ts";

test("[U5] ascii text measures as length", () => {
  assert.equal(visibleWidth("hello"), 5);
  assert.equal(visibleWidth(""), 0);
});

test("[U4] CJK characters count as two columns", () => {
  assert.equal(visibleWidth("上下文"), 6);
  assert.equal(visibleWidth("src/上下文.ts"), 13); // 4 + 6 + 3
});

test("combining and zero-width characters count as zero", () => {
  assert.equal(visibleWidth("e\u0301"), 1);
  assert.equal(visibleWidth("a\u200bbc"), 3);
});

test("ANSI escapes are ignored", () => {
  assert.equal(visibleWidth("\x1b[31mred\x1b[0m"), 3);
  assert.equal(visibleWidth("\x1b[1;32mgreen\x1b[0m"), 5);
});

test("[U4] truncateToWidth keeps wide characters whole", () => {
  // "上下文" is 6 columns; cutting at 5 must drop the last char, not half of it
  assert.equal(truncateToWidth("上下文", 5), "上下");
  assert.equal(truncateToWidth("上下文", 6), "上下文");
  assert.equal(truncateToWidth("上下文", 1), "");
});

test("truncateToWidth preserves escapes within the kept region", () => {
  const s = "\x1b[31mabcd\x1b[0m";
  // Escapes inside the kept region survive and do not count toward width.
  // Trailing escapes past the cut are dropped; the TUI layer re-applies
  // styles per rendered line (docs/tui.md), so no color leaks across lines.
  assert.equal(truncateToWidth(s, 2), "\x1b[31mab");
  assert.equal(truncateToWidth(s, 4), "\x1b[31mabcd\x1b[0m");
});

test("truncateToWidth never splits surrogate pairs", () => {
  assert.equal(truncateToWidth("a😀b", 2), "a");
  assert.equal(truncateToWidth("a😀b", 5), "a😀b");
});

test("padEndToWidth aligns by visible columns", () => {
  assert.equal(padEndToWidth("ab", 5), "ab   ");
  assert.equal(padEndToWidth("上下", 4), "上下");
  assert.equal(padEndToWidth("上下", 6), "上下  ");
  assert.equal(padEndToWidth("上下", 7), "上下   ");
  assert.equal(visibleWidth(padEndToWidth("上下", 8)), 8);
});

test("charWidth basic classification", () => {
  assert.equal(charWidth("a".codePointAt(0)!), 1);
  assert.equal(charWidth("上".codePointAt(0)!), 2);
  assert.equal(charWidth("😀".codePointAt(0)!), 2);
});

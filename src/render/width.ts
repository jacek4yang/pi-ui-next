// Terminal visible-width handling. ANSI-aware, CJK-aware.
// Mirrors pi-tui's guidance (docs/tui.md): measure visible columns, never
// string length. Implemented locally so pure modules stay testable without
// importing the host TUI package.

const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK Radicals .. CJK Symbols
  [0x3041, 0x33ff], // Hiragana .. CJK Compatibility
  [0x3400, 0x4dbf], // CJK Ext A
  [0x4e00, 0x9fff], // CJK Unified
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe30, 0xfe4f], // CJK Compatibility Forms
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff], // emoji (majority rendered wide)
  [0x20000, 0x2fffd], // CJK Ext B+
  [0x30000, 0x3fffd],
];

const ZERO_WIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // combining diacritics
  [0x200b, 0x200f], // zero-width space/marks
  [0xfe00, 0xfe0f], // variation selectors
  [0x1ab0, 0x1aff],
  [0x20d0, 0x20ff],
];

function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

export function charWidth(cp: number): number {
  if (cp === 0) return 0;
  if (inRanges(cp, ZERO_WIDTH_RANGES)) return 0;
  if (inRanges(cp, WIDE_RANGES)) return 2;
  return 1;
}

/** Visible terminal width of a string, ignoring ANSI escape sequences. */
export function visibleWidth(text: string): number {
  let total = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.codePointAt(i);
    if (ch === undefined) break;
    if (ch === 0x1b) {
      i = skipEscape(text, i);
      continue;
    }
    total += charWidth(ch);
    i += ch > 0xffff ? 2 : 1;
  }
  return total;
}

/** Returns the index just past the escape sequence starting at `start`. */
function skipEscape(text: string, start: number): number {
  const next = text.charAt(start + 1);
  if (next === "[") {
    // CSI: ESC [ params final-byte (@ through ~)
    let i = start + 2;
    while (i < text.length) {
      const code = text.charCodeAt(i);
      if (code >= 0x40 && code <= 0x7e) return i + 1;
      i++;
    }
    return text.length;
  }
  if (next === "]") {
    // OSC: ESC ] ... terminated by BEL or ST (ESC \)
    const bel = text.indexOf("\x07", start + 2);
    const st = text.indexOf("\x1b\\", start + 2);
    if (bel === -1 && st === -1) return text.length;
    if (bel !== -1 && (st === -1 || bel < st)) return bel + 1;
    return st + 2;
  }
  // two-byte escapes (ESC X etc.)
  return start + (next === "" ? 1 : 2);
}

/**
 * Truncate a string to at most `width` visible columns.
 * Never splits a surrogate pair; wide characters are dropped whole when they
 * do not fit. ANSI escapes are preserved but they do not count toward width.
 */
export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  let out = "";
  let used = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.codePointAt(i);
    if (ch === undefined) break;
    if (ch === 0x1b) {
      const end = skipEscape(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    const w = charWidth(ch);
    if (used + w > width) break;
    out += text.slice(i, i + (ch > 0xffff ? 2 : 1));
    used += w;
    i += ch > 0xffff ? 2 : 1;
  }
  return out;
}

/** Pad a string with spaces to exactly `width` visible columns. */
export function padEndToWidth(text: string, width: number): string {
  const pad = width - visibleWidth(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}

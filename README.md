# pi-ui-next

Experimental human-facing TUI enhancement layer for [Pi](https://github.com/earendil-works/pi)
(the coding agent). One coherent owner of the activity timeline, tool and
nested-tool rendering, Code Mode presentation, header/footer/editor framing,
theme system, and telemetry presentation.

**Status: bootstrap.** Feature work happens on `feat/*` branches; `main` holds
the verified baseline only. Architecture: `make-pi-great-again/docs/UI-SPEC.md`,
contracts: `make-pi-great-again/integration/CONTRACTS.md`.

## Development

```bash
npm ci
npm run ci        # typecheck + lint + format:check + tests
npm run package-smoke
pi -e ./          # try the extension in one invocation (requires Pi >= v1.0.2)
```

Progressive disclosure is the product: raw JSON is never the default human
presentation. See the UI spec for the four visual levels and the golden-test
requirements (80/120/160 columns, ASCII/Unicode/Nerd Font, CJK correctness).

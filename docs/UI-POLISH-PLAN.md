# pi-ui-next 视觉美化方案 (UI Polish Plan)

- **分支**: `feat/theme-deep-polish` (基于 `feat/nested-code-renderer`)
- **原则**: 装饰永远服从可读性; 保持 U1–U6 不变量; 宽度感知 ANSI + CJK 安全。

---

## 1. 改动范围与逐项设计

### 1.1 主题基元 (`src/render/themed.ts`)

提供一组统一接受 `Theme` 对象的纯函数，封装语义着色与格式化逻辑，禁止业务代码硬编码 ANSI 或猜测 token。

- **状态图标着色 (`renderStatusIcon`)**:
  - `success` -> `theme.fg("success", icon)` (例如 `✓`)
  - `failure` -> `theme.fg("error", icon)` (例如 `✗`)
  - `warning` -> `theme.fg("warning", icon)` (例如 `⚠`)
  - `running` -> `theme.fg("accent", icon)` (例如 `●`)
  - `cancelled` -> `theme.fg("muted", icon)` (例如 `⊘`)
- **文本层级强调与弱化**:
  - 工具名 / 标题: `theme.fg("toolTitle", name)`
  - 元数据 (耗时 / 调用数 / 字节数): `theme.fg("muted", text)`
  - 弱提示 / 占位符: `theme.fg("dim", text)`
- **diff 行着色 (`formatDiffLine`)**:
  - `+` 开头: `theme.fg("toolDiffAdded", line)`
  - `-` 开头: `theme.fg("toolDiffRemoved", line)`
  - `@@` / 上下文: `theme.fg("toolDiffContext", line)`
- **微型压力条 (`renderProgressBar`)**:
  - 10 格槽位: `usedBlocks` 个 `█`，`10 - usedBlocks` 个 `░`
  - 阈值颜色:
    - `< 50%`: `theme.fg("success", bar)`
    - `50% ~ 79%`: `theme.fg("warning", bar)`
    - `>= 80%`: `theme.fg("error", bar)`
  - 百分比文字跟随对应阈值色或普通文本色。
- **路径中间截断 (`truncateMiddlePath`)**:
  - 超过最大宽度时，保留头部与尾部，中间用 `…` 连接，例如 `packages/…/src/render/tool-renderer.ts`。
  - 基于 `visibleWidth` 计算，确保 CJK 与 Unicode 安全。
- **页脚徽章 (`formatFooterBadge`)**:
  - 风格: `— <runtime> · <duration> · exit <code>`，统一使用 `muted` 色；若 `exit != 0`，exit 部分高亮 `error` 色。

#### 预期视觉 (文字小样)

```text
✓ read  src/…/context.ts · 142 lines · 12ms
✗ bash  npm test · exit 1 · 1.4s
  ██████░░░░ 60% · 163.2k/272.0k (provider-reported)
  + import { Theme } from "@earendil-works/pi-coding-agent";
  - import { OldTheme } from "./old.ts";
  — node · 0.2s · exit 0
```

#### 风险与对策

- **风险**: ANSI 逃逸字符导致 `visibleWidth` 误判或字符串切断时 ANSI 截断。
- **对策**: 使用现有的 `src/render/width.ts` (`visibleWidth`, `truncateToWidth`, `padEndToWidth`)，着色前计算几何宽度，着色后逐行截断。

---

### 1.2 工具结果与调用渲染器 (`src/render/tool-renderer.ts`, `src/render/result-summary.ts`)

- **renderCall**:
  - 工具名: `toolTitle`
  - 参数摘要: `muted`
  - 代码/命令执行工具 (`python`, `node`, `code`, `bash`, `powershell`, `code_buffer`):
    - 解构 `source`, `command`, `cmd`, `code`, `patch`
    - 单行命令: `$ <highlighted-command>` / `PS> <highlighted-command>`
    - 多行代码: 首行工具标题/超时信息，后续行 2 空格缩进并应用语法高亮 (`highlightCode`)
    - 折叠态默认最多 8 行，带 `... (N more lines, click to expand)`
    - 展开态完整展示语法高亮代码块
  - 路径参数过长时调用 `truncateMiddlePath`
  - 命令参数折叠到 48 列以内
  - 文字小样:
    ```python
    python
      print("Hello from Python!")
      import sys
      print(sys.version)
    ```
- **renderResult**:
  - 状态图标: 成功 `success`、失败 `error`、警告 `warning`、流式运行中 `accent`
  - 头部元数据行: `✓ toolName · metadata` (如 `✓ python · 110ms` 或 `✓ code · revision 7 · 8 calls · 3.4s`)
  - 输出预览与语法高亮:
    - 自动识别 JSON 输出并应用 `json` 语法高亮
    - 针对 Python / Node 堆栈跟踪 (Traceback): 错误名加粗高亮、文件路径 `accent` 高亮、行号 `warning` 着色、帧栈 `muted` 弱化
    - 自动过滤底层运行时末尾嵌入的冗余退出信息 (如 `[python exited with code 0 in 0.1s]`)，防止与页脚徽章重复
    - 常规内联: 最多 6 行 (非 expanded)
    - 展开 (expanded): 最多 16 行
    - 每行通过 `truncateToWidth` 适配终端宽度
  - 针对 diff 输出 (edit 工具或含 patch 文本): 逐行检视 `+` / `-`，应用 `toolDiffAdded` / `toolDiffRemoved`
  - 针对错误输出: 首行 `error` 色，保留至少 4 行错误信息正文
  - 针对 partial / isPartial: 图标为 running，高亮 `accent`
  - 针对 pinx.exec: `✓ node · revision 7 · 8 calls · 3.4s` (运行时名 toolTitle，元数据 muted)
  - 页脚规范: 紧随预览块，无多余空行，前缀短横线 `— toolName · duration · exit code` (muted，非 0 退出标红)

#### 预期视觉 (文字小样)

```text
✓ read src/render/width.ts · 120 lines
  1: // Terminal visible-width handling. ANSI-aware, CJK-aware.
  2: // Mirrors pi-tui's guidance (docs/tui.md): measure visible columns, never
  3: // string length. Implemented locally so pure modules stay testable without
  — read · 4ms

✓ edit src/render/width.ts  +4 -1
  @@ -42,3 +42,6 @@
  + export function truncateMiddlePath(...) {
  +   ...
  + }
  — edit · 15ms

✗ bash npm test · exit 1
  Error: 1 test failed
    at assert.equal (test/width.test.ts:42:10)
  Command failed with exit code 1
  — bash · 1.2s · exit 1
```

#### 风险与对策

- **风险**: `next()` 解析链可能破坏现有渲染器注册，或者将 ANSI 色泄露进 Level 0 纯文本投影。
- **对策**: `tool-renderer.ts` 严格只在 `next() === undefined` 或带有 `pinx.exec` 时介入；ANSI 样式仅存在于 `renderCall` / `renderResult` 返回的 `Component` (`Text`) 中，绝不传入 `project.ts`。

---

### 1.3 实时面板 (`src/index.ts` widget)

重构为分节式 3–5 行紧凑面板，采用组件工厂 `(tui, theme) => Component` 形式，注入当前主题。

- **行 1 (状态行)**:
  - 运行/就绪图标 + 状态词 (`● Working · 18.4s` 或 `✓ Idle`)
  - 调用计数与失败提示: `· 3 calls`；若 `failed > 0`，失败部分以 `warning` 或 `error` 着色: `· 1 failed`
- **行 2 (上下文压力行)**:
  - 若收到 `pinx.context.status` 契约事件:
    - 微型压力条: `█████░░░░░ 42%` (按 50%/80% 变色)
    - 标记 token 数及真实来源: `114.0k/272.0k (provider-reported)`
    - 若有 reclaimable / archived 补充信息: `· reclaimable ~12.0k`
- **行 3 (最近事件行)**:
  - 若收到 `pinx.activity` 事件或最新执行 summary:
    - 图标 + 摘要，颜色为 `accent`
- **宽度与去重保证**:
  - 每行计算完成后均调用 `truncateToWidth(line, tui.terminal.width || 80)`
  - 保留 `lastWidgetLines` 去重判断，内容无变化时不触发无效重绘

#### 预期视觉 (文字小样)

```text
● Working · 12.3s · 4 calls · 1 failed
██████░░░░ 62% · 168.0k/272.0k (provider-reported) · reclaimable ~18.5k
context.hygiene: replaced 4 calls with evidence refs
```

#### 风险与对策

- **风险**: 终端过窄 (如 80 列以下) 导致压力条和长字符折行破坏编辑器排版。
- **对策**: 压力条固定 10 字符，全部文字预先格式化并通过 `truncateToWidth` 强制截断，决不断行。

---

### 1.4 `/ui-next` 概览命令 (`src/index.ts`)

将原先纯文本提示框升级为带边框卡片结构：

- 使用 `@earendil-works/pi-tui` 的 `Box`、`VStack`、`Text` 组件组合
- 边框采用 `round` 或单线样式，边框色取 `theme.fg("border", ...)` / `borderMuted`
- 分区卡片:
  - **Header**: `pi-ui-next v1.0.2 · 4 turns · 12 calls`
  - **Turn 概览**: 对齐的 timeline 树状投影，使用 `padEndToWidth`
  - **Failures 专区** (若有失败): 醒目标出失败节点与工具名
  - **Evidence / Checkpoint 专区** (若有契约数据)

#### 预期视觉 (文字小样)

```text
╭─ pi-ui-next 1 · 2 turns · 1 failed ─────────────────────────╮
│ Turn 1                                                      │
│ ├─ ✓ grep     12 matches                                    │
│ ├─ ✗ bash     npm test · exit 1                             │
│ └─ ✓ read     src/index.ts                                  │
│                                                             │
│ Failed Calls (1)                                            │
│ • bash: npm test (exit 1)                                   │
╰─────────────────────────────────────────────────────────────╯
```

#### 风险与对策

- **风险**: `ctx.ui.notify` 或模态弹窗对复杂的自定义 Component 支持度不同。
- **对策**: 检查 `ctx.ui` 方法，若在通知中使用多行 Text，或使用 `Box` 渲染成字符串行传入 `notify`，保证终端兼容性。

---

### 1.5 间距节奏与页脚一致性

- **空行规则**:
  - 投影 / 面板中段落节之间保留严格 1 行空行。
  - 工具输出预览与其尾随页脚之间不留空行。
- **页脚统一风格**:
  - `— <tool/runtime> · <duration> · exit <code>`
  - 全部默认 `muted` 色；非 0 exit code 用 `error` 色；遵守 U6，严禁篡改退出码与指标。

---

### 1.6 图标三模式 (`src/render/icons.ts`)

- `IconMode` 类型扩展为 `"unicode" | "ascii" | "nerd"`。
- 新增 `nerd` 图标字典:
  - `running`: `󰪥`
  - `success`: `󰄳`
  - `failure`: `󰅚`
  - `cancelled`: `󰅙`
  - `warning`: `󰀦`
  - `branch`: `├─`
  - `lastBranch`: `└─`
  - `vertical`: `│`
  - `expanded`: `󰅀`
  - `collapsed`: `󰅂`
- 保持 `unicode` 与 `ascii` 现有字符完全不变，确保已有 golden 测试基线不被无故破坏。
- 为 `nerd` 模式新增单元测试。

---

## 2. 阶段规划与交付路径

| 阶段                     | 交付物                                           | 关键验证               |
| ------------------------ | ------------------------------------------------ | ---------------------- |
| **Phase 0 — 方案**       | `docs/UI-POLISH-PLAN.md`                         | 文档审核，不改代码     |
| **Phase 1 — 主题基元**   | `src/render/themed.ts`, `test/themed.test.ts`    | 单元测试全覆盖，CI 绿  |
| **Phase 2 — 工具渲染器** | 重写 `renderResult`/`renderCall`, 快照测试       | CI 绿，双冒烟绿        |
| **Phase 3 — 实时面板**   | 重构 widget (3-5 行分节), 压力条与去重           | CI 绿，双冒烟绿        |
| **Phase 4 — 总览命令**   | `/ui-next` 概览卡片重构                          | CI 绿，双冒烟绿        |
| **Phase 5 — 节奏与收尾** | 页脚间距统一, nerd 图标集, 必要时 golden 更新    | `npm run ci`, 双冒烟绿 |
| **Phase 6 — 交付报告**   | 分支 `feat/theme-deep-polish` 准备就绪，提交报告 | 符合 AGENTS.md 规范    |

---

## 3. 验收标准

- `npm run ci` (typecheck + eslint + prettier + tests) 100% 通过。
- `node scripts/pi-load-smoke.mjs` 正常加载无 warning/error。
- `node scripts/verify-agent-load.mjs` 真实配置验证通过。
- 绝无硬编码 ANSI，绝无未声明 token，绝无未捕获的 CJK 宽度溢出。

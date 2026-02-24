# Treeverse 现代化升级方案

## 概述

Treeverse 是一个 Chrome 扩展，以树状形式展示 Twitter/X 推文的评论。当前技术栈停留在 2020 年，需要全面现代化以确保扩展能够继续在 Chrome 中运行（MV2 即将被强制禁用）。

项目总代码量约 1500 行 TypeScript，体量小，适合一次性迁移。

## 当前技术栈

| 组件 | 版本 | 问题 |
|------|------|------|
| TypeScript | 3.8 | 缺少现代语法支持（可选链、模板字面量类型等） |
| webpack | 4 | 需要 `NODE_OPTIONS=--openssl-legacy-provider` hack 才能运行 |
| d3 | 5 (全量导入) | 打包体积大（~500KB），API 已过时 |
| Manifest | V2 | Chrome 已弃用，即将强制禁用 |
| copy-webpack-plugin | 5 | 手动管理扩展资源拷贝 |
| ts-loader | 6 | 编译速度慢 |

## 目标技术栈

| 组件 | 版本 | 理由 |
|------|------|------|
| **Vite** | 6.x | 零配置、极速 HMR、原生 TS 支持 |
| **@crxjs/vite-plugin** | latest | 从 manifest.json 驱动扩展构建，自动处理资源 |
| **TypeScript** | 5.x | 现代语法、更好的类型推断 |
| **Manifest V3** | - | Chrome 强制要求 |
| **d3** | 7.x (按需导入) | 减小打包体积，Tree-shaking 友好 |
| **pnpm** | latest | 更快的包管理 |

## Manifest V2 → V3 关键变化

### API 迁移映射

```
background.scripts          → background.service_worker (单文件)
page_action                 → action
chrome.extension.getURL()   → chrome.runtime.getURL()
chrome.tabs.executeScript() → chrome.scripting.executeScript()
chrome.declarativeContent   → chrome.action (配合 rules)
```

### 权限变化

```jsonc
// MV2
{
  "permissions": ["activeTab", "declarativeContent", "https://x.com/"]
}

// MV3
{
  "permissions": ["activeTab", "scripting"],
  "host_permissions": ["https://x.com/*", "https://twitter.com/*", "https://mobile.x.com/*", "https://mobile.twitter.com/*"]
}
```

### web_accessible_resources 变化

```jsonc
// MV2
"web_accessible_resources": ["resources/*"]

// MV3
"web_accessible_resources": [{
  "resources": ["resources/*"],
  "matches": ["https://x.com/*", "https://twitter.com/*", "https://mobile.x.com/*", "https://mobile.twitter.com/*"]
}]
```

## D3 v5 → v7 关键变化

### 导入方式

```typescript
// 之前: 全量导入 (~500KB)
import * as d3 from 'd3'

// 之后: 按需导入 (tree-shakable)
import { select, selectAll } from 'd3-selection'
import { hierarchy, tree } from 'd3-hierarchy'
import { zoom, zoomIdentity } from 'd3-zoom'
import { scaleSqrt } from 'd3-scale'
import { interpolateNumber } from 'd3-interpolate'
import { dispatch } from 'd3-dispatch'
import { transition } from 'd3-transition'
```

### API 变化

```typescript
// 1. d3.event 已移除，改为事件回调参数
// 之前:
.on('zoom', () => { d3.event.transform })
.on('click', () => { d3.event.stopPropagation() })
.on('keydown', () => { d3.event.code })

// 之后:
.on('zoom', (event) => { event.transform })
.on('click', (event) => { event.stopPropagation() })
.on('keydown', (event) => { event.code })

// 2. transition 调用方式变化
// 之前:
d3.transition(null).tween(...)

// 之后:
select(element).transition().tween(...)
```

### 受影响的文件

| 文件 | 变化点 |
|------|--------|
| `tweet_visualization.ts` | `d3.event` → 事件参数 (zoom, click, keydown 共 ~8 处) |
| `feed_controller.ts` | `d3.transition(null)` → 选中元素 transition |
| `toolbar.ts` | `d3.select` → `select` (导入变化) |

## 实施步骤

### Phase 1: 项目骨架 (Vite + TS5 + MV3)

**目标**: 用 Vite 替换 webpack，Manifest V3 替换 V2。

1. 初始化 pnpm，安装 vite + @crxjs/vite-plugin + typescript 5
2. 创建 `vite.config.ts`
3. 编写新的 `manifest.json`（MV3 格式）
4. 更新 `tsconfig.json`（target: ESNext, module: ESNext）
5. 删除 webpack.config.js、ts-loader、copy-webpack-plugin 等旧依赖

**验证**: `pnpm dev` 能启动，扩展能加载到 Chrome。

### Phase 2: Background 迁移

**目标**: 将 background page 迁移为 service worker。

涉及文件:
- `src/background/chrome_action.ts` → `src/background/service-worker.ts`
- `src/background/common.ts`

关键变化:
1. `chrome.pageAction` → `chrome.action`
2. `chrome.declarativeContent` → `chrome.action.onClicked` + URL 匹配
3. `chrome.tabs.executeScript` → `chrome.scripting.executeScript`
4. 移除 Firefox 特定代码（`firefox_action.ts`），或保留为单独构建目标

**验证**: 在推文页面点击扩展图标能正常响应。

### Phase 3: Content Script + Viewer 迁移

**目标**: 迁移页面注入脚本和 viewer 入口。

涉及文件:
- `src/content/main.ts` — 逻辑不变，仅调整导入
- `src/viewer/main.ts` — `chrome.extension.getURL` → `chrome.runtime.getURL`
- `src/viewer/proxy.ts` — 逻辑不变

**验证**: 扩展能注入到 x.com 页面，GraphQL 请求能正常发出和接收。

### Phase 4: D3 升级

**目标**: d3 v5 → v7，改为按需导入。

涉及文件:
- `src/viewer/tweet_visualization.ts` — 最大改动，~8 处 `d3.event` 替换
- `src/viewer/feed_controller.ts` — transition API 变化
- `src/viewer/toolbar.ts` — 导入变化

**验证**: 树状图正常渲染，缩放/点击/键盘导航正常工作。

### Phase 5: 清理

1. 删除旧文件: `webpack.config.js`、`watch.sh`、`build_extensions.sh`、`lint.sh`
2. 移除调试日志 (`console.log('[Treeverse]')`)
3. 移除旧的 `APIResponse` 类型和 `TweetParser` namespace（legacy 解析器）
4. 移除未使用的 `serialize.ts`、`web_entry.ts`（分享功能已删除）
5. 更新 `package.json` 清理旧依赖
6. 更新 `.gitignore`
7. 更新 `README.md`

**验证**: 完整功能回归测试。

## 目录结构（迁移后）

```
treeverse/
├── docs/
│   └── modernization-plan.md
├── public/
│   ├── icons/
│   └── resources/
│       ├── index.html
│       └── style.css
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   └── main.ts
│   └── viewer/
│       ├── main.ts
│       ├── proxy.ts
│       ├── feed_controller.ts
│       ├── tweet_parser.ts
│       ├── tweet_server.ts
│       ├── tweet_tree.ts
│       ├── tweet_visualization.ts
│       ├── toolbar.ts
│       └── page.ts
├── manifest.json              ← MV3, Vite 直接读取
├── vite.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

## 风险与注意事项

1. **@crxjs/vite-plugin 兼容性**: 确认其对 MV3 content script 注入页面脚本的支持情况。如果不支持，可能需要手动处理 `content.js` 的构建。
2. **Service Worker 生命周期**: MV3 的 service worker 会在空闲时被销毁。当前 `tweetToLoad` 状态存在内存中，可能需要改用 `chrome.storage.session`。
3. **D3 v7 类型**: `@types/d3` 的按需子包需要逐个安装（`@types/d3-selection`、`@types/d3-hierarchy` 等）。
4. **Firefox 支持**: Firefox 仍支持 MV2 和部分 MV3。如需继续支持 Firefox，需要维护两套 manifest 或使用 `browser_specific_settings`。

## 时间估计

| 阶段 | 估计时间 |
|------|---------|
| Phase 1: Vite + MV3 骨架 | 1-2h |
| Phase 2: Background 迁移 | 1h |
| Phase 3: Content + Viewer 迁移 | 1-2h |
| Phase 4: D3 升级 | 1-2h |
| Phase 5: 清理 | 30min |
| **总计** | **5-8h** |

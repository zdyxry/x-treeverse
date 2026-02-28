# Contributing to X-Treeverse

感谢你对 X-Treeverse 的兴趣！本文档将帮助你了解如何参与项目开发和发布。

## 开发环境设置

### 前置要求

- Node.js 20+
- npm 10+
- Chrome 浏览器

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/zdyxry/x-treeverse.git
cd x-treeverse

# 安装依赖
npm install

# 启动开发模式（带 HMR）
npm run dev
```

开发模式下：
- 修改代码后会自动重新编译
- 需要手动刷新 Chrome 扩展页面 (`chrome://extensions/`)
- 或者使用扩展页面的刷新按钮

### 加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目的 `dist/` 目录

## 项目脚本

```bash
npm run dev         # 开发模式（带 HMR）
npm run build       # 生产构建
npm run build:dev   # 开发构建（带 source map）
npm run lint        # ESLint 检查
npm run type-check  # TypeScript 类型检查
```

## 提交更改

1. 创建功能分支：`git checkout -b feature/your-feature`
2. 提交更改：`git commit -m "Add some feature"`
3. 推送到远程：`git push origin feature/your-feature`
4. 创建 Pull Request

## 发布新版本

我们使用 GitHub Actions 自动构建和发布。

### 版本号规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **MAJOR**: 不兼容的 API 更改
- **MINOR**: 向下兼容的功能添加
- **PATCH**: 向下兼容的问题修复

### 发布步骤

1. **更新版本号**

   ```bash
   # 更新 manifest.json 和 package.json 中的版本号
   # 例如：1.0.0 -> 1.1.0
   ```

2. **提交版本更新**

   ```bash
   git add manifest.json package.json
   git commit -m "Bump version to v1.1.0"
   git push
   ```

3. **创建标签**

   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```

4. **等待自动构建**

   GitHub Actions 会自动：
   - 构建项目
   - 创建 ZIP 文件
   - 创建 GitHub Release
   - 附加构建产物

5. **下载构建产物**

   访问 [Releases](../../releases) 页面下载 `x-treeverse-v1.1.0.zip`

6. **测试构建产物**

   - 在全新 Chrome 用户配置中测试
   - 确保所有功能正常工作

7. **提交到 Chrome Web Store**

   - 登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - 上传 ZIP 文件
   - 填写商店信息
   - 提交审核

### 紧急修复

如果需要紧急修复：

1. 修复代码
2. 更新 PATCH 版本号（如 1.1.0 -> 1.1.1）
3. 创建新标签并推送
4. 快速审核通常需要 1-2 小时

## CI/CD 工作流

项目包含两个 GitHub Actions 工作流：

### CI Workflow (`.github/workflows/ci.yml`)

触发条件：
- Push 到 `main` 或 `master` 分支
- Pull Request 到 `main` 或 `master` 分支

执行：
- 安装依赖
- 类型检查
- ESLint 检查
- 构建项目
- 上传构建产物

### Release Workflow (`.github/workflows/release.yml`)

触发条件：
- Push 以 `v` 开头的标签（如 `v1.0.0`）

执行：
- 构建项目
- 创建 ZIP 文件
- 创建 GitHub Release
- 自动附加 ZIP 文件

## 调试技巧

### Service Worker 调试

1. 打开 `chrome://extensions/`
2. 找到 X-Treeverse，点击「Service Worker」
3. 在 DevTools 中查看 Console 和设置断点

### Content Script 调试

1. 在 Twitter/X 页面按 F12
2. Console 过滤器选择「Verbose」
3. 搜索 `[Treeverse]` 前缀的日志

### 快速重载扩展

```javascript
// 在 Service Worker Console 中执行
chrome.runtime.reload()
```

## 代码风格

- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 使用 2 空格缩进
- 使用单引号

## 报告问题

如果你发现了 bug 或有功能建议：

1. 先搜索 [Issues](../../issues) 确认是否已存在
2. 创建新 Issue，包含：
   - 问题描述
   - 复现步骤
   - Chrome 版本
   - 扩展版本
   - 相关截图或日志

## 许可证

通过提交 PR，你同意你的代码将在 MIT 许可证下发布。

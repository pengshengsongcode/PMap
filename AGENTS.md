# PMap Agent 指南

## 项目背景

PMap 是一个 React + Vite + TypeScript H5 地图工具，基于高德地图 JS API 2.0 做二次开发，用来查询某个公交站牌能直达的地面公交线路。

当前通过 GitHub Pages 部署：

```text
https://pengshengsongcode.github.io/PMap/
```

核心使用流程：

1. 页面加载后默认请求当前位置。
2. 定位成功后自动选择最近的地面公交站。
3. 用户也可以输入站名，在全国范围内搜索公交站。
4. 选择站点后展示所有途经该站的地面公交线路。
5. 点击单条线路绘制该线路；点击“显示全部”绘制当前站点返回的全部线路。

## 产品规则

- 这是一个手机优先的工具，所有交互和 UI 先按小屏设备验证。
- 移动端浮层面板默认保持紧凑收起状态。
- 浮层面板的所有可触区域都应该支持上下拖拽，不只限于顶部把手。
- 点击“显示全部”后，先收起浮层面板，再开始绘制全部线路。
- 面板头部必须保留日间/夜间切换入口。
- 日间/夜间切换需要同时影响 UI 样式和高德地图样式或地图视觉处理。
- 默认支持全国搜索，不要再把城市写死为北京，除非用户明确要求。
- UI 应保持干净、实用、地图工具风格，不要恢复赛博朋克、霓虹、重装饰方向。
- 不要添加含义不清的“删除”“清空”按钮，除非交互目标非常明确，并且按钮文案能准确描述结果。
- 只保留地面公交语义。需要过滤地铁、轻轨、磁悬浮、轮渡、索道、机场轨道线等非地面公交线路。
- 站点候选应优先展示真实公交站。不要让地铁出入口、无公交线路的 POI 挤占候选列表。

## 高德配置与密钥

本地环境变量：

```bash
VITE_AMAP_KEY=...
VITE_AMAP_SECURITY_JS_CODE=...
VITE_AMAP_CITY=
```

- `.env.local` 只用于本地开发，绝不能提交。
- `.env.example` 可以提交，但只能放占位符。
- GitHub Pages 使用仓库变量 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_JS_CODE`。
- `VITE_AMAP_CITY` 是可选变量；缺失或为空时表示全国搜索。
- 当前明文 JS 安全密钥方案只适合本地和内测 MVP；正式生产环境应改为高德推荐的代理服务方案。
- 不要在源码、文档、测试、日志或最终回复里打印、复制、提交真实 token 或密钥。

## 代码结构

- 应用主流程在 `src/App.tsx`。
- 浮层面板、移动端拖拽和面板交互在 `src/components/TransitPanel.tsx`。
- 高德地图服务封装在 `src/services/amapTransit.ts` 和 `src/services/amapLoader.ts`。
- 站点、线路归一化和过滤规则在 `src/domain/transit.ts`。
- 高德地图相关 TypeScript 类型在 `src/types/amap.ts`。
- GitHub Pages 的 base path 在 `vite.config.ts`，通过 `--mode github-pages` 启用。

开发时遵守：

- 优先沿用现有 React state、hook 和 helper 写法，不要随意引入新的抽象。
- 路线绘制、地图图层清理逻辑尽量集中在 `App.tsx`。
- 站点/线路归一化逻辑应保持纯函数，并配套单元测试。
- UI 尺寸要有明确的 grid/flex 约束，避免移动端文字、按钮、面板横向溢出。
- 按钮图标优先使用 `lucide-react` 中已有图标。

## 验证要求

任何功能或 UI 改动完成前，必须至少运行：

```bash
npm run test:run
npm run build -- --mode github-pages
```

如果改动涉及 UI，还必须用真实浏览器验证。可以使用 Chrome headless、Chrome DevTools Protocol 或 Playwright。

移动端至少验证：

- 390px 宽度下没有横向滚动。
- 浮层面板默认是收起状态。
- 授权定位后能自动选择附近公交站。
- 日间/夜间切换能改变 UI 和地图视觉。
- 点击“显示全部”后面板会收起。

桌面端至少验证：

- 左侧面板可用。
- 地图没有被面板错误遮挡。
- 搜索、候选站、线路列表仍能正常展示。

如果浏览器验证无法执行，最终回复里必须说明原因，并写清楚做了哪些替代验证。

## 部署

- 推送到 `main` 会触发 GitHub Pages workflow。
- Pages 构建命令：

```bash
npm run build -- --mode github-pages
```

- 推送后需要确认最新 `Deploy to GitHub Pages` workflow 成功。
- 提交部署改动后，本地工作区应保持干净。

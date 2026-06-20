# PMap 北京公交站牌直达线路 H5 MVP

基于高德地图 JS API 2.0 的本地 H5 原型：搜索北京公交站，选择站点后列出途经线路，点击线路绘制完整路线，也可以一次性显示全部线路。

## 本地运行

1. 复制环境变量模板：

```bash
cp .env.example .env.local
```

2. 填入高德开放平台的 JS API Key 和安全密钥：

```bash
VITE_AMAP_KEY=...
VITE_AMAP_SECURITY_JS_CODE=...
VITE_AMAP_CITY=北京
```

3. 安装依赖并启动：

```bash
npm install
npm run dev
```

## 可用命令

```bash
npm run test:run
npm run build
npm run preview
```

## 说明

- 当前版本使用明文 `securityJsCode`，只适合本地和内测。
- 正式部署前建议改为高德官方推荐的代理服务器转发方式，避免密钥暴露。
- 首版固定城市为北京，后续可扩展为定位城市或城市切换。

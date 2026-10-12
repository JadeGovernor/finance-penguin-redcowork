# 部署说明（纯静态）

本作品是纯前端应用，构建产物为 `dist/`，**不需要任何后端、数据库或环境变量**。

```bash
npm install
npm run build      # 产出 dist/
```

## 为什么放哪都能跑

- `vite.config.ts` 使用 `base: './'`：所有资源引用为相对路径。
- `src/main.tsx` 使用 `HashRouter`：路由写在 `#/` 之后，静态托管不需要任何路由重写规则。

因此 `dist/` 既可以放在站点根目录，也可以放在任意子路径（如 `/finance-penguin/`）。

## 常见托管方式

**1. 本地静态服务器（验证用）**

```bash
cd dist && python3 -m http.server 8000
# 打开 http://127.0.0.1:8000
```

**2. GitHub Pages**

```bash
npm run build
npx gh-pages -d dist        # 或把 dist/ 内容推到 gh-pages 分支
```

**3. 任意对象存储 / CDN**

把 `dist/` 整个目录上传即可，入口文件是 `dist/index.html`。

**4. REDcowork（本次提交）**

只上传 `dist/` 的前端产物（或本仓库源码），**不要包含任何 Key**。演示模式离线可用，评审无需配置即可跑通完整流程。

## 安全提醒

在线模式需要用户自行填入 DeepSeek API Key；Key 只保存在访问者本机浏览器的 `localStorage`，不会写入代码、构建产物或仓库。仓库中**不包含任何密钥**。

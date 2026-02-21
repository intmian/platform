# Frontend 开发说明

## 启动

```bash
npm install
npm run dev
```

默认使用 Vite 本地开发服务。

## MCP Playwright 调试（推荐）

当前仓库已移除本地 `@playwright/test` E2E 方案，前端调试统一建议使用 MCP Playwright。

### 标准调试流程（给后续 AI）

1. 先确认前端服务可访问（通常是 `http://127.0.0.1:5173`）。
2. 使用 MCP Playwright 打开页面并抓取 snapshot。
3. 若 `library` 页面加载无数据：
  - 点击左上角头像/入口，弹出登录框。
  - 使用账号 `admin`、密码可以读取后端运行文件夹(从项目backend中找pack或test文件夹)base_setting中的admin_pwd 登录。
  - 登录后刷新或重新进入目标页面再继续排查。
4. 对关键节点保留证据：
  - 抓取 snapshot（结构与可访问性）
  - 必要时截图（视觉确认）
  - 查看 console/network（JS 报错与接口失败）
5. 优先定位根因：接口未返回、鉴权状态缺失、前端渲染条件不满足。

### MCP 操作建议

- 首选 `snapshot` 找元素引用，再执行 `click/type/press`，降低误点概率。
- 先做“最小动作”复现问题，再逐步补充交互，避免一次性脚本过长。
- 每次关键操作后等待页面稳定，再读取 console/network。
- 调试结论要区分“现象”“证据”“可能根因”。

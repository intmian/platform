# 前端

- 请求统一走 `common/api.ts`（`request` 不抛异常、`post` 失败抛 `ApiError`），路径自动加 `/api` 前缀。本地由 Vite 代理到后端（默认 `127.0.0.1:8080`，`PLATFORM_BACKEND` 环境变量可改）并去掉 `/api`；`/share-link/*` 也代理到后端。后端接口几乎都是 JSON `POST`，读也一样；返回 `code=0` 表示成功，数据在 `data`。健康检查是 `POST /api/check`，不是 GET。少数管理接口（`/admin/services`、`/admin/log/get`、`/admin/storage/*`）不是这个格式，见 `admin/adminApi.ts`。
- 本地访问用 `localhost:5173`，Vite 可能只绑了 `::1`，`127.0.0.1:5173` 不一定能连上。
- 包管理用 npm（`package-lock.json`），CI 依次跑 typecheck、vitest、build，类型错误会挡住部署。

## 外壳（`src/shell`）

所有路径都经过外壳：没登录显示全屏锁屏（公开应用除外），`/` 是桌面，其余按 `shell/apps.tsx` 的应用清单挂载。拍过板的决定：
- 形态是“启动台 + 全屏应用”，不做多窗口。应用底部正中有悬浮胶囊：回桌面按钮、最近用过的 3 个应用（点一下直接切）、“更多”打开完整的切换面板。往下滚时收起，往上滚、滚到底或鼠标移到屏幕底部时出现。胶囊层级低于 antd 弹窗遮罩，弹窗开着时切不走。（曾经是 iPhone 那种细横条，太隐蔽，找不到回桌面和最近应用。）
- 所有应用共用窗口滚动条，外壳按应用记住滚动位置，切回来时恢复。
- 最近用过的保活应用（`keepAlive`）留在后台不卸载，最多 3 个，超出卸载最早的；管理后台不保活。
- 登录过期时锁屏盖在应用上面，应用不卸载；请求失败会节流地调 `/check` 确认是否掉线。
- 桌面布局整份 JSON 存在后端 `/misc/home/get|set`（后端不解析，带版本号，冲突时以服务器为准），本地另存一份秒开。清单里新加的应用自动出现在桌面末尾，用户移除的不会补回。
- manifest 故意不写 `start_url`：从哪一页添加到 iPhone 主屏，图标就打开哪一页。主屏图标取当前应用的 `touchIcon`（外壳按应用切换）。

写应用时要遵守（保活的应用在后台时 DOM 还在、router 的 location 冻结在离开时那一页）：
- 新应用：在 `apps.tsx` 加一项，入口组件里用相对路径的 `<Routes>`。登录由外壳保证，应用里不要再做登录框，用户从 `useAuth()` 取。
- 不要直接改 `document.title`、favicon，不要用 `window.history` / `popstate` / `window.location.pathname`：标题用 `shell/runtime` 的 `useAppTitle`，导航用 react-router。
- “回到前台就刷新”的逻辑要同时挂 `useAppActive`（应用之间切换不会触发 `visibilitychange`）。挂在 body 上的抽屉、全局键盘监听要看 `useIsAppActive()`，否则会盖到别的应用上或在后台响应。
- 固定在底部的元素要让开横条：`bottom: calc(var(--homebar-h) + var(--safe-bottom) + 12px)`。
- 应用里不要放网站 logo、页头或“回首页”链接，回桌面交给外壳。
- 屏幕尺寸只用 `common/breakpoints.ts`（只看宽度，不看 UA）。

## 复用和约定

- 先复用再造轮子：
  - `common/UniConfig` + `ConfigsCtr`：通用配置表单（读写走 `common/cfgApi.ts`）；
  - `common/MenuPlus`：应用内分区导航（桌面左侧列表、手机顶部横条），每个分区是一个子路由，方便固定到桌面（管理、脚本、试验场在用）；
  - `common/aiGateway.ts`（`sendAiAction`、`transcribeAudio`）：AI 调用一律走它，后端按 action 白名单处理；
  - `common/WhisperButton` + `useAudioRecorder`：语音输入；
  - `appendNoCacheParam`（`todone/Library.tsx`）：给远程图片加 `__cf_bust`，绕开 CDN 旧缓存的 CORS 问题。
- 语音输入（实时模式）拍过板的行为：点下立即开录，连接在后台建；断线自动重连并把最后一句定稿之后的音频补发，不丢不重；30 秒没出新字（离线时看音量）自动结束，硬上限默认 5 分钟；到最后仍转不出的录音存进 IndexedDB（`common/voicePending.ts`），按钮角标手动重试，文字插到当前光标。预览直接显示在输入框里，不用气泡。
- 颜色用 antd theme token；普通 CSS 用 `shell/theme.tsx` 写到 `:root` 的 `--pf-*` 变量，不写死色值（有含义的数据色除外）。新页面在不破坏现有风格的前提下可以有自己的设计。
- 图标：应用图标是同一个角色（Platform娘）拿不同道具的二次元插画，设定稿在 `icon-src/platform-girl-handbook.html`，新应用照它生成；主图标（窗台猫）保持正式简约。母版放 `icon-src/<id>-1024.png`，导出到 `public/icons/<id>-192.png`（桌面）、`-180.png`（iPhone 主屏，必须不透明）、`-32.png`（标签页），`apps.tsx` 按 id 自动取。
- antd 按钮两个汉字之间不自动加空格（全局关掉了 `autoInsertSpace`）。
- `src/debug/debug.tsx`（`/debug`，只在本地开发出现）是组件试验场：改文件里的 `TARGET`/`TARGET_PROPS` 挂一个组件单独调交互。
- Note Mini 已经迁到独立项目 `memos-mian`，这里不再有入口。`FlagNote = 2` 保留不复用；R2 上传、AI、语音这些共享能力和历史文件链接都要保留。

# 登录状态查看说明

## 目标

本项目当前的“可视化登录”已经从单纯结构化摘要，升级为“缓存摘要 + 在线校验”的状态查看体验。

也就是说，你现在可以先查看：

- GitHub 当前本地是否已保存登录信息
- Gmail 当前是否具备 `gmail-basic` 能力
- 当前账号是谁
- GitHub 当前优先显示 GitHub name，缺少时回退为 `@login`
- 当前显示的是缓存摘要还是在线校验结果
- 缺少哪些 capability bundle
- 下一步该做什么

## 推荐入口

优先使用：

```text
auth_status_overview()
```

它会返回适合展示的汇总结果。

如果你要直接查看体验层使用的 GitHub / Gmail 两张状态卡，再使用：

```text
auth_status_cards()
```

如果你要触发真实在线校验，再使用：

```text
auth_refresh_status_card({ cardId: "github" })
auth_refresh_status_card({ cardId: "gmail" })
```

如果你要看某一个 provider 的详细状态，再使用：

```text
auth_status({ provider: "github" })
auth_status({ provider: "google", capabilityBundle: "gmail-basic" })
```

本地 HTML 面板 `ui_open_panel()` 当前行为是：

1. 先展示 GitHub / Gmail 的缓存摘要
2. 再并行自动触发 GitHub / Gmail 在线校验
3. 用户也可以手动刷新单张卡片状态

这里的 `Gmail` 状态定义为：

- `provider=google`
- `capabilityBundle=gmail-basic`
- 在线 refresh / profile 校验成功

它不等于官方 Gmail connector 登录态。

## 状态含义

- `unauthenticated`
  - 当前没有本地保存的登录信息
- `saved`
  - 本地 secret 已存在，但还没有恢复成完整状态；可以继续执行校验恢复
- `authenticated`
  - 当前已校验且可用
- `reauth_required`
  - provider 已有登录信息，但当前能力卡片缺少所需 bundle，例如 Gmail 缺少 `gmail-basic`
- `expired`
  - 登录信息存在，但已过期或 refresh 失败
- `invalid`
  - 状态或 secret 存在问题，需要重新登录
- `not_configured`
  - 登录所需配置还不完整

## 浏览器说明

Google OAuth 当前支持：

- 项目内联调脚本优先显式调用 `Chrome`
- 手动把授权 URL 复制到 `Chrome`

当前用户环境只有 `Chrome` 也不会影响本项目设计。

# 登录状态查看说明

## 目标

本项目第一版“可视化登录”不是完整网页登录面板，而是结构化登录状态可视化。

也就是说，你现在可以先查看：

- 哪些 provider 已保存登录信息
- 哪些 provider 已完成校验
- 当前账号是谁
- 缺少哪些 capability bundle
- 下一步该做什么

## 推荐入口

优先使用：

```text
auth_status_overview()
```

它会返回适合展示的汇总结果。

如果你要看某一个 provider 的详细状态，再使用：

```text
auth_status({ provider: "github" })
auth_status({ provider: "google", capabilityBundle: "gmail-basic" })
```

## 状态含义

- `unauthenticated`
  - 当前没有本地保存的登录信息
- `saved`
  - 本地 secret 已存在，但还没有恢复成完整状态；可以继续执行校验恢复
- `authenticated`
  - 当前已校验且可用
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

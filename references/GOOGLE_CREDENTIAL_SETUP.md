# Google 凭证获取与配置指南

## 目标

这份文档说明如何为当前项目准备 Google OAuth 凭证。

当前项目支持两条 Google 认证路径：

- `browser_oauth`
- `manual_refresh_token`

两条路径都依赖你自己的 Google OAuth client 信息。

## 为什么当前项目需要你自己的 Google OAuth client

当前 Codex 在 API 登录路线与当前本地环境下，官方 Gmail / Google Drive 插件登录能力失效或不可稳定依赖。

因此，这个项目不会直接复用官方插件登录态，而是通过本地 OAuth 流程获取：

- `clientId`
- `clientSecret`
- access token / refresh token

## 当前项目推荐使用哪种 Google 配置

当前推荐：

- 优先创建 `Desktop app` 类型的 OAuth client
- 优先使用 `browser_oauth`

原因：

- 当前项目本身就是本地桌面 / 本地 loopback 回调的使用方式
- `browser_oauth` 是当前最自然的联调路径
- `manual_refresh_token` 更适合作为高级备用路径

官方参考：

- Google Cloud Console Help：
  - [Get started with the Google Auth Platform](https://support.google.com/cloud/answer/15544987?hl=en-GB)
  - [Manage OAuth Clients](https://support.google.com/cloud/answer/6158849?hl=en)
  - [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)
  - [Unverified apps](https://support.google.com/cloud/answer/7454865?hl=en)
- Google for Developers：
  - [OAuth 2.0 for iOS & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)

## 创建 Google Cloud 项目与应用

1. 打开 Google Cloud Console
2. 进入 `Google Auth Platform`
3. 如果还没有项目，先创建一个 project
4. 在 Auth Platform 概览页点击 `Get started`
5. 填写应用信息：
   - App name
   - User support email
6. 选择 audience / user type

### 当前建议

如果你只是自己测试当前项目：

- 优先用适合个人测试的最小配置
- 不要一开始就按生产验证思路折腾

如果你的 app 还在 testing 状态：

- 需要把你实际要登录测试的 Google 账号加入 test users

根据 Google 当前说明：

- Testing 状态下最多允许最多 100 个 test users
- test user 的授权通常会有测试期限制

## 创建 Desktop app OAuth client

1. 在 Google Auth Platform 的 Clients 页面点击 `Create client`
2. 选择 `Desktop app`
3. 输入一个容易识别的 client 名称
4. 点击创建
5. 下载生成的 client JSON

当前项目需要你从下载的 JSON 中拿到：

- `installed.client_id`
- `installed.client_secret`

## 当前项目需要开什么 API

如果你要用 Gmail：

- 确保 Gmail 相关 API 已启用

如果你要用 Drive / Docs / Sheets / Slides：

- 确保 Drive 相关 API 已启用

当前项目在代码里对应的 bundle 与 scope 如下：

- `gmail-basic`
  - `https://www.googleapis.com/auth/gmail.readonly`
- `drive-basic`
  - `https://www.googleapis.com/auth/drive.readonly`
  - `https://www.googleapis.com/auth/documents.readonly`
  - `https://www.googleapis.com/auth/spreadsheets.readonly`
  - `https://www.googleapis.com/auth/presentations.readonly`

这些 scope 是项目在运行时请求的，不需要你手工拼进代码，但需要你的 Google Cloud 应用配置与 consent screen 能接受这些请求。

## 方案一：browser_oauth

### 适用场景

适合：

- 你第一次给当前项目接 Google
- 你希望按浏览器授权完成一次完整登录

### 使用步骤

1. 调用：

```text
auth_begin({
  provider: "google",
  method: "browser_oauth",
  capabilityBundle: "gmail-basic"
})
```

2. 记下返回的 `sessionId`

3. 再调用：

```text
auth_complete({
  sessionId: "...",
  payload: {
    clientId: "...",
    clientSecret: "..."
  }
})
```

4. 打开返回的授权 URL
5. 在浏览器中完成授权
6. 回调完成后，再次调用：

```text
auth_complete({
  sessionId: "..."
})
```

7. 最后验证：

```text
auth_status({ provider: "google", capabilityBundle: "gmail-basic" })
auth_validate({ provider: "google" })
```

### 当前项目的 Google OAuth 行为

当前项目会：

- 使用本地 loopback 回调
- 默认请求 `prompt=consent select_account`
- 使用 PKCE
- 优先尝试拉起 `Chrome`
- 若自动拉起失败，允许你手动复制授权 URL

## 方案二：manual_refresh_token

### 适用场景

适合：

- 你已经有可用 refresh token
- 你希望跳过完整浏览器流程
- 你在做更偏手工的本地接入

### 当前项目要求

你需要准备：

- `clientId`
- `clientSecret`
- `refreshToken`

使用方式：

```text
auth_begin({
  provider: "google",
  method: "manual_refresh_token",
  capabilityBundle: "drive-basic"
})
```

然后：

```text
auth_complete({
  sessionId: "...",
  payload: {
    clientId: "...",
    clientSecret: "...",
    refreshToken: "..."
  }
})
```

## 如何从下载的 JSON 提取字段

当前项目通常使用下载后的 desktop client JSON 中的 `installed` 段。

你要关注：

- `installed.client_id`
- `installed.client_secret`

如果你下载的凭证不包含当前项目需要的字段，通常说明：

- 你选的 client 类型不匹配当前项目
- 或当前项目实现与这份 client 的使用方式不匹配

当前最稳妥的做法仍然是：

- 使用 `Desktop app`
- 用下载后的 JSON 取 `client_id` 和 `client_secret`

## 常见错误

### `400 invalid_request`

先检查：

- 是否真的选了 `Desktop app`
- `clientId` / `clientSecret` 是否来自同一个 client
- 是否使用了当前返回的完整授权 URL

### `org_internal` 或用户无法登录

先检查：

- 你的 audience / user type 设置是否允许当前账号使用
- 如果是 testing 状态，当前账号是否已被加入 test users

### 出现 unverified app 提示

这通常不代表当前项目坏了，而是：

- 你的 app 请求了敏感 scope
- 但还没走正式验证

对个人测试来说，这通常是常见现象。

### 浏览器打开了，但回调没完成

先检查：

- 本地 `127.0.0.1` / `localhost` 回调是否被拦截
- 当前 gateway 进程是否还在运行
- 是否重复提交了旧 session

### `invalid_grant`

先检查：

- 授权码是否已经被消费
- refresh token 是否失效
- client 与当前流程是否匹配

### 能登录但 Gmail / Drive 仍不工作

先检查：

- 你使用的是 `gmail-basic` 还是 `drive-basic`
- consent screen 上声明的 scope 与项目实际请求的 scope 是否一致
- 当前是否确实启用了对应 API

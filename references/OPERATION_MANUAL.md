# 操作手册

## 文档说明

### 手册目标

这份文档是本项目当前阶段的正式操作手册，面向“实际要使用这个项目的人”。

它重点回答：

- 现在能做什么
- 现在怎么操作
- 每一步会看到什么结果
- 出问题时先查什么

### 适用对象

适合以下读者：

- 想实际启动和使用本项目的人
- 想登录 GitHub 或 Google 的使用者
- 想查看当前登录状态的人
- 想排查基本登录问题的人

### 当前版本覆盖范围

当前手册只覆盖**已经实现**的能力，不把未来规划写成已经支持。

当前已实现：

- 启动本地 MCP 服务
- 运行测试和 smoke test
- 查看 provider 列表
- 查看登录状态摘要
- 查看 GitHub / Gmail 状态卡
- 对单张状态卡执行在线校验
- 查看单个 provider 状态
- GitHub `manual_token` 登录
- GitHub 仓库链接发布预览
- GitHub 仓库链接发布执行
- Google `browser_oauth` 登录
- Google `manual_refresh_token` 登录
- 状态校验
- 注销本地凭据
- 本地 HTML 面板 `ui_open_panel`
- GitHub `manual_token` 真实联调已验证通过

当前真实联调状态：

- GitHub `manual_token` 已跑通
- Google `browser_oauth` 已跑通
- GitHub 当前已验证可从 `saved` 恢复到 `authenticated`

当前未实现：

- 官方 `@gmail/@github` 入口接管
- Gmail 发信/读信
- GitHub 仓库/PR/issue 等更完整业务操作
- 更接近官方插件的输入框级统一体验

当前接入现状：

- 项目内已提供 `mcp/service-auth-gateway/.mcp.json`
- 当前用户环境已把 `service-auth-gateway` 注册到全局 Codex MCP 配置
- 这表示 Codex 可以从全局配置发现该服务
- 不表示官方 Gmail / GitHub 插件已经接管本地登录态

相关导航：

- [DOCUMENTATION_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/DOCUMENTATION_GUIDE.md)
- [PROJECT_CONTEXT.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/PROJECT_CONTEXT.md)

## 使用前提

### 环境假设

当前项目默认基于以下环境编写：

- Windows
- 已安装 `Node.js`
- 已安装 `npm`
- 当前用户机器只有 `Chrome`

### Chrome 说明

Google OAuth 默认支持：

- 项目内联调脚本优先显式调用 `Chrome` 打开授权链接
- 或手动复制授权 URL 到 `Chrome`

当前用户环境只有 `Chrome` 不会影响本项目使用。

### 当前能力边界

本项目当前是“统一认证层 + 登录状态可视化原型”，不是完整业务客户端。

这意味着：

- 现在可以做登录、状态查看、状态校验、注销
- 现在可以做 GitHub 最小发布链路：仓库链接预览、自动建个人仓、commit、push
- 现在不能直接发 Gmail 邮件
- 现在还不能直接做 GitHub PR / issue / 分支等更完整仓库操作

## 快速导航

如果你只想快速找到入口，可以按下面看：

- 我想登录 Google：
  - 看“Google 浏览器 OAuth 登录”
- 我想登录 GitHub：
  - 看“GitHub `manual_token` 登录”
- 我想查看当前状态：
  - 看“查看登录状态摘要”
- 我想把当前项目推送到 GitHub：
  - 看“GitHub 仓库链接发布”
- 我想看某一个 provider 的详细状态：
  - 看“查看单个 provider 状态”
- 我想排查问题：
  - 看“故障排查”

## 当前可执行操作

### 启动 MCP 服务

#### 前提

- 当前项目已存在 `mcp/service-auth-gateway`
- 本机可运行 `node`
- 若要依赖 Codex 自动发现该服务，当前用户环境还需要存在有效的全局 MCP 注册

#### 步骤

进入目录：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login-experience\mcp\service-auth-gateway
```

启动服务：

```powershell
npm start
```

#### 结果

- 本地 `service-auth-gateway` MCP 服务启动
- 后续可接收 MCP 工具调用
- 若全局配置仍指向当前项目下的 `src/server.js`，Codex 重新加载配置后也可发现该服务

#### 下一步

- 如果只是检查服务是否正常，继续执行“运行 smoke test”
- 如果要开始使用，继续执行“查看 provider 列表”或“查看登录状态摘要”

### 运行测试

#### 前提

- 已进入 `mcp/service-auth-gateway` 目录

#### 步骤

```powershell
npm test
```

#### 结果

- 会运行当前自动化测试
- 如果通过，说明当前认证层核心逻辑可正常工作

#### 下一步

- 建议再执行一次 smoke test

### 运行 smoke test

#### 前提

- 已进入 `mcp/service-auth-gateway` 目录

#### 步骤

```powershell
npm run smoke
```

#### 结果

- 会验证 MCP 服务初始化
- 会验证 `tools/list`
- 会验证 `auth_list_providers`

#### 下一步

- 如果 smoke test 正常，可继续执行具体登录流程

### 查看 provider 列表

#### 前提

- MCP 服务已可调用

#### 步骤

调用：

```text
auth_list_providers()
```

#### 结果

可查看当前支持的 provider，目前固定为：

- `github`
- `google`

#### 下一步

- 如果要查看总体状态，继续执行“查看登录状态摘要”
- 如果要登录某个服务，直接跳到对应登录章节

### 查看登录状态摘要

#### 前提

- MCP 服务已可调用

#### 步骤

调用：

```text
auth_status_overview()
```

#### 结果

会返回适合做登录状态可视化的摘要，包括：

- provider
- 当前状态
- 当前账号
- 已授权 bundles
- 上次校验时间
- 下一步建议动作

#### 下一步

- 如果要看某个 provider 的详细信息，继续执行“查看单个 provider 状态”
- 如果状态提示需要重新登录，进入对应登录章节

### 打开本地 HTML 面板

#### 前提

- MCP 服务已可调用

#### 步骤

调用：

```text
ui_open_panel()
```

#### 结果

- 会启动或复用本地 `127.0.0.1` 面板服务
- 会返回带本地 `panel token` 的面板 URL
- 项目会优先尝试用本机 `Chrome` 打开该面板

#### 当前面板能力

- 首屏显示 GitHub / Gmail 缓存状态卡，再自动执行在线校验
- 手动刷新 GitHub / Gmail 单张状态卡
- GitHub 账号优先显示 GitHub name，缺少时回退为 `@login`
- Gmail 账号优先显示 Gmail profile 邮箱，拿不到时回退到 Google profile email
- 注销 GitHub 本地凭据
- 当前不支持面板内 Gmail 注销
- 填写仓库链接、commit message 并执行 GitHub 发布预览 / 发布
- 预览区显示待提交文件扁平列表，执行后结果区会继续显示发布结果或阻塞原因

#### 当前面板边界

- 面板当前只覆盖本地认证状态查看与 GitHub 发布，不是完整业务客户端
- Gmail 卡片只是 `google + gmail-basic` 的本地在线校验，不代表官方 Gmail connector 登录态

### 查看登录状态卡

#### 前提

- MCP 服务已可调用

#### 步骤

调用：

```text
auth_status_cards()
```

单卡在线校验：

```text
auth_refresh_status_card({ cardId: "github" })
auth_refresh_status_card({ cardId: "gmail" })
```

#### 结果

- 返回 GitHub / Gmail 两张体验层状态卡
- 区分当前是本地缓存摘要还是已完成在线校验
- 用中文用户态文案显示状态、账号和下一步动作

#### 下一步

- 如果要查看更通用的 provider 摘要，继续执行“查看登录状态摘要”
- 如果要查某个 provider 的完整状态，继续执行“查看单个 provider 状态”

### GitHub 仓库链接发布

#### 适用范围

- 当前只支持当前已登录 GitHub 个人账号名下仓库
- 支持目标仓库不存在时自动创建
- 当前不支持组织仓库
- 当前不支持非空远端自动合并、pull、rebase 或 force push

#### 第一步：发布预览

调用：

```text
github_publish_prepare({
  projectPath: "项目绝对路径",
  repositoryUrl: "https://github.com/<你的账号>/<仓库名>"
})
```

#### 预览会检查

- 当前 GitHub 登录是否仍有效
- 仓库链接是否合法
- owner 是否属于当前已登录个人账号
- 当前项目是否已是 git 仓库
- 当前是否已存在 `origin`
- `origin` 是否与目标仓库冲突
- 目标仓库是否存在、是否为空仓、是否允许自动创建
- 当前项目有哪些待提交文件

#### 预览结果

会返回：

- 是否可继续发布
- 阻塞原因或下一步动作
- 待提交文件清单
- 是否需要你补 `visibility`
- 是否需要你确认预览

#### 第二步：执行发布

在预览通过后，再调用：

```text
github_publish_execute({
  projectPath: "项目绝对路径",
  repositoryUrl: "https://github.com/<你的账号>/<仓库名>",
  commitMessage: "你的 commit message",
  confirmStagePreview: true,
  visibility: "private",
  createRepository: true
})
```

#### 执行说明

- 如果目标仓库已存在且可直接用，则不需要 `visibility` / `createRepository`
- 如果目标仓库不存在，则必须显式提供 `visibility`
- `commitMessage` 必须由你提供，当前不会自动生成

#### 执行结果

- 仓库不存在时，会自动创建个人仓库
- 当前目录不是 git 仓库时，会自动 `git init`
- 首次分支默认用 `main`
- 会绑定干净 HTTPS `origin`
- 会完成 stage、commit、push
- token 不会写入 `.git/config` 或 remote URL

### 查看单个 provider 状态

#### 前提

- 已确定要检查哪个 provider

#### 步骤

查看 GitHub：

```text
auth_status({ provider: "github" })
```

查看 Google Gmail 能力：

```text
auth_status({ provider: "google", capabilityBundle: "gmail-basic" })
```

查看 Google Drive 能力：

```text
auth_status({ provider: "google", capabilityBundle: "drive-basic" })
```

#### 结果

可查看：

- 当前状态
- 当前账号
- 是否缺少 capability bundle
- 下一步建议动作

#### 下一步

- 如果未登录或状态异常，继续执行登录或校验流程

### GitHub `manual_token` 登录

#### 前提

- 你已经准备好 GitHub PAT

#### 步骤

1. 开始登录流程：

```text
auth_begin({
  provider: "github",
  method: "manual_token",
  capabilityBundle: "github-basic"
})
```

2. 记录返回的 `sessionId`

3. 完成登录：

```text
auth_complete({
  sessionId: "...",
  payload: {
    token: "你的 GitHub PAT"
  }
})
```

#### 结果

- MCP 会调用 GitHub API 校验 token
- 成功后会保存 secret 和状态

#### 下一步

- 建议执行：

```text
auth_status({ provider: "github" })
```

确认状态是否已变为 `authenticated`

### Google 浏览器 OAuth 登录

#### 前提

- 你有可用的 Google OAuth client 信息
- 浏览器可打开授权链接

#### 步骤

1. 开始流程：

```text
auth_begin({
  provider: "google",
  method: "browser_oauth",
  capabilityBundle: "gmail-basic"
})
```

2. 使用返回的 `sessionId` 再调用一次：

```text
auth_complete({
  sessionId: "...",
  payload: {
    clientId: "...",
    clientSecret: "..."
  }
})
```

3. 记录返回的授权 URL

4. 在浏览器中打开该 URL
- 项目内联调脚本优先显式调用 `Chrome`
- 也可以手动复制到 `Chrome`
- 当前授权 URL 默认带 `prompt=consent select_account`
- 当前授权 URL 默认带 `PKCE (S256)`
- 当前默认回调为 `http://localhost:<port>/`

5. 完成 Google 授权

6. 浏览器回调完成后，再次调用：

```text
auth_complete({
  sessionId: "..."
})
```

#### 结果

- MCP 接收本地 loopback 回调
- OAuth code 被交换成 token
- secret 和状态被保存
- 如果当前 Windows 主机上的 Node 无法直接连接 `oauth2.googleapis.com`，项目会回退到 PowerShell 网络请求继续完成 token 交换

#### 当前联调结论

- 当前已验证授权页和本地回调可达
- 当前真实联调已验证 token 可落库并恢复为 `authenticated`
- 在部分 Windows 主机上，如 Node 直连 Google token 接口超时，项目会自动走 PowerShell 网络回退

#### 下一步

- 建议执行：

```text
auth_status({ provider: "google", capabilityBundle: "gmail-basic" })
```

确认状态

### Google `manual_refresh_token` 登录

#### 前提

- 你已有 Google OAuth client 信息
- 你已有可用的 refresh token

#### 步骤

1. 开始流程：

```text
auth_begin({
  provider: "google",
  method: "manual_refresh_token",
  capabilityBundle: "drive-basic"
})
```

2. 记录 `sessionId`

3. 完成登录：

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

#### 结果

- MCP 会尝试刷新 access token
- 成功后保存状态和 secret

#### 下一步

- 建议执行对应 `auth_status`

### 状态校验

#### 前提

- provider 已存在本地 secret 或状态

#### 步骤

校验 GitHub：

```text
auth_validate({ provider: "github" })
```

校验 Google：

```text
auth_validate({ provider: "google" })
```

#### 结果

- 如果 secret 可用，会刷新或恢复状态
- 如果 secret 无效，会返回异常状态

#### 下一步

- 如状态仍异常，参考“故障排查”

### 注销本地凭据

#### 前提

- 目标 provider 已存在本地状态或 secret

#### 步骤

```text
auth_logout({ provider: "github" })
```

或：

```text
auth_logout({ provider: "google" })
```

#### 结果

- 本地状态会被删除
- 对应 secret 会被移除

#### 下一步

- 可再次调用 `auth_status_overview()` 确认结果

## 状态说明

更完整说明可参考：

- [LOGIN_STATUS_USAGE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/LOGIN_STATUS_USAGE.md)

当前状态含义如下：

- `unauthenticated`
  - 当前没有本地保存的登录信息
- `saved`
  - 本地 secret 已存在，但还没有恢复成完整状态；可以继续校验恢复
- `authenticated`
  - 当前已校验且可用
- `reauth_required`
  - 当前 provider 已有登录信息，但缺少当前能力所需 bundle，需要重新授权
- `expired`
  - 登录信息存在，但已过期或 refresh 失败
- `invalid`
  - 状态或 secret 存在问题，需要重新登录
- `not_configured`
  - 登录所需配置还不完整

## 常见场景

### 首次登录 Google

推荐路径：

- 使用 `browser_oauth`
- 完成浏览器授权
- 回来执行 `auth_complete`
- 再用 `auth_status` 确认结果

### 首次登录 GitHub

推荐路径：

- 准备 GitHub PAT
- 使用 `manual_token`
- 完成 `auth_complete`
- 再用 `auth_status` 确认结果

### 重启后检查状态

推荐路径：

1. 调用：

```text
auth_status_overview()
```

2. 如果状态为 `saved`
- 再执行：

```text
auth_validate({ provider: "..." })
```

### bundle 缺失后的补登录

如果 `auth_status` 提示缺少 capability bundle：

- 重新按对应 provider 发起登录
- 使用需要的 bundle 再做一次认证

## 故障排查

### 浏览器打不开

先检查：

- 是否能手动复制授权 URL 到 `Chrome`
- 是否存在本机浏览器权限限制

### OAuth 回调未返回

先检查：

- 是否完成了浏览器里的授权
- 本地 `127.0.0.1` 回调是否被拦截
- MCP 服务是否仍在运行

### Google 授权页直接返回 `400 invalid_request`

先检查：

- 当前使用的是否是 Desktop app 类型的 OAuth client
- `clientId` / `clientSecret` 是否来自同一个 OAuth client
- 是否确实使用了当前返回的完整授权 URL，而不是旧 URL
- 是否存在 Google Cloud 侧的 OAuth client 或 consent screen 配置限制

### Google 已完成授权跳转，但最终仍未登录成功

先检查：

- `auth_complete` 之后返回的是否是 `invalid_grant`
- 当前这次授权码是否已经被旧进程、旧测试或重复提交消耗
- Google OAuth client 是否与当前桌面应用用法完全匹配

### 运行测试后真实登录状态异常

先检查：

- 当前自动化测试是否在测试隔离目录下运行
- 是否误把真实 `data/state.json` 或 `data/sessions.json` 当成测试产物重置

### secret 存在但状态未恢复

先检查：

```text
auth_status_overview()
```

如果显示 `saved`，再执行：

```text
auth_validate({ provider: "..." })
```

### MCP 已注册但 Codex 未发现

先检查：

- MCP 服务配置是否正确
- Codex 是否已重新加载配置
- 项目路径和 Node 路径是否仍然有效
- `C:\Users\86175\.codex\config.toml` 中是否仍存在 `mcp_servers.service-auth-gateway`

### GitHub 发布预览提示 owner 不支持

先检查：

- 仓库链接里的 owner 是否就是当前已登录 GitHub 账号
- 当前是否误填了组织仓库链接

### GitHub 发布提示 `origin` 冲突

先检查：

- 当前项目是否已绑定了其他远端仓库
- 目标仓库是否和现有 `origin` 实际指向同一地址

### GitHub 发布提示远端非空

先检查：

- 目标仓库是否已经有文件或历史提交
- 当前项目是否已经绑定到了同一个远端

### GitHub 发布提示没有待提交内容

先检查：

- 当前目录下是否真的有新增、修改或删除文件
- 是否把错误的目录路径传给了 `projectPath`

## 后续扩展预留

以下内容当前仅预留章节，不代表已实现：

### Gmail 发信

待补充

### Gmail 读信

待补充

### GitHub 基础操作

当前已实现：

- 仓库链接发布预览
- 仓库自动创建、commit、push

后续待补充：

- 仓库信息读取
- 分支查看
- PR / issue 等操作

### 登录状态可视化面板

当前已实现：

- 本地 HTML 面板 `ui_open_panel`

当前未实现：

- 更完整桌面级 UI

### 官方 `@gmail/@github` 兼容

远期探索，当前不承诺

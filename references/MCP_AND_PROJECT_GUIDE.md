# 新手说明：什么是 MCP，以及这个项目到底在做什么

## 先说结论

如果你是第一次接触 Codex、插件、登录、MCP，这样理解最容易：

- `Skill` 更像“做事说明书”
- `MCP` 更像“可调用的本地工具服务”
- 这个项目做的事情是：
  - 用一个统一 `skill` 告诉 Codex 该怎么判断登录问题和 GitHub 聊天请求
  - 用一个本地 `MCP` 服务真正处理登录状态、登录流程和认证信息
  - 用一个本地路由决策接口决定后续应该继续走本地能力，还是切回官方插件
  - 用结构化状态摘要、状态卡片和本地 HTML 面板实现当前阶段的“登录状态可视化”

简单说，`skill` 负责“会不会做、怎么想、怎么判断”，`MCP` 负责“能不能真的执行”。

---

## 一、什么是 MCP

`MCP` 可以理解成：

**让大模型安全、结构化地调用外部能力的一种协议和运行方式。**

如果只看字面，初学者很容易把它想复杂。你可以先把它想成：

- 大模型本身会“理解”和“推理”
- 但大模型本身不会直接操作你的本机程序、账号、浏览器、数据库、第三方 API
- 如果你想让它真的去做这些事，就需要给它一个“工具入口”
- `MCP` 就是这个工具入口的一种标准化方式

### 你可以把 MCP 想成什么

可以把 MCP 想成一个“工具插座”。

比如：

- 你问 Codex：“帮我看 GitHub 是否已登录”
- Codex 自己并不知道你本机里有没有登录 GitHub
- 但如果它连着一个 `MCP server`
- 它就可以调用这个 server 提供的工具，比如：
  - `auth_status`
  - `auth_begin`
  - `auth_validate`

也就是说：

- 你提需求给 Codex
- Codex 调用 MCP 工具
- MCP 工具去读本地状态、调用外部 API、处理认证流程
- 再把结果返回给 Codex
- Codex 再把结果翻译成你能理解的话

---

## 二、为什么不直接让 Skill 处理登录

这是很多新手最容易混淆的地方。

### Skill 是什么

`skill` 本质上是一套说明和流程约束。

它可以告诉 Codex：

- 遇到什么场景要触发
- 应该怎么判断
- 优先走哪条路线
- 需要用哪些工具

但是 `skill` 自己并不能直接：

- 保存 token
- 发起 OAuth
- 监听本地回调端口
- 调用 GitHub API
- 调用 Google OAuth 接口

### MCP 是什么

`MCP server` 才是真正有能力执行这些事情的那一层。

所以你可以这样区分：

- `skill` 是大脑里的流程卡片
- `MCP` 是真正能动手的手和工具箱

如果只有 `skill`，Codex 只能“知道应该怎么做”

如果只有 `MCP`，Codex 虽然“能调用工具”，但缺少统一的判断逻辑和用户交互约束

所以这个项目选择的是两层组合：

- 上层：`service-auth-router` skill
- 下层：`service-auth-gateway` MCP

---

## 三、用“登录 Google”举一个完整例子

下面用一个最典型的例子来解释 MCP 是怎么工作的。

假设你的目标是：

**让 Codex 具备使用 Google 登录状态的能力，比如以后去读 Gmail 或 Google Drive。**

### 第 1 步：你提出需求

你对 Codex 说：

`帮我登录 Google`

### 第 2 步：Skill 先判断

这时，`service-auth-router` 这个 skill 会先做判断：

- 你是在请求“登录”
- 目标服务是 `google`
- 你可能需要的能力是：
  - `gmail-basic`
  - 或 `drive-basic`

然后它还会判断：

- 官方 Google 插件能不能直接用
- 如果不能，就改走本地 `MCP`

### 第 3 步：Codex 调用 MCP 工具开始登录

接着，Codex 会调用：

```text
auth_begin({
  provider: "google",
  method: "browser_oauth",
  capabilityBundle: "gmail-basic"
})
```

### 第 4 步：MCP 返回登录准备信息

本地 `service-auth-gateway` 收到这个调用后，会准备一件事情：

 - 在本机 loopback 地址上临时开启一个本地回调监听地址

然后它会返回：

- 一个 `sessionId`
- 一个 Google 授权 URL
- 一个本地 `redirectUri`

### 第 5 步：你在浏览器里完成授权

你打开那条 Google 授权链接。

浏览器里你会做这些事：

- 选择 Google 账号
- 同意授权范围
- Google 把浏览器重定向回本地地址

例如回到：

```text
http://localhost:某个端口/
```

### 第 6 步：本地 MCP 接住回调

这时，这个项目里的 MCP 会做一件关键事情：

- 它监听了这个本地地址
- 它收到 Google 回传的 `code` 和 `state`
- 它把这些信息记到当前登录 session 里

### 第 7 步：Codex 再次调用 auth_complete

然后再调用一次：

```text
auth_complete({
  sessionId: "..."
})
```

这时 MCP 会：

- 取出刚刚收到的 `code`
- 拿着 `clientId`、`clientSecret` 去请求 Google token 接口
- 换回 `access_token` 和 `refresh_token`
- 再验证这个登录是否真的有效

### 第 8 步：MCP 保存凭据和状态

如果成功，它会做两件事：

1. 把敏感凭据保存到 Windows Credential Manager
2. 把非敏感状态写入项目内状态文件

### 第 9 步：以后 Codex 可以先检查状态

以后再问：

`Google 现在登录了吗？`

Codex 就可以调用：

```text
auth_status({
  provider: "google",
  capabilityBundle: "gmail-basic"
})
```

来判断：

- 是否已登录
- 当前账号是谁
- 授权是否过期
- 缺不缺对应能力包

---

## 四、这个项目的核心设计

这个项目不是一个普通的“登录脚本合集”，而是一个统一登录原型。

它的设计分成两层。

### 1. 上层：统一 skill

目录：

- [skill/service-auth-router](D:/project/CodexWorkSpace/2026-04-29-login/skill/service-auth-router)

它主要负责“判断”：

- 这是登录问题，还是状态检查问题
- 这是 GitHub 登录请求，还是 GitHub 仓库 / 分支 / PR / issue / 发布请求
- 是 GitHub，还是 Google
- 该走官方插件，还是走本地网关
- 缺少哪些关键参数需要先补齐
- 后续应该给下游什么标准结论

### 2. 下层：本地 MCP 网关

目录：

- [mcp/service-auth-gateway](D:/project/CodexWorkSpace/2026-04-29-login/mcp/service-auth-gateway)

它主要负责“执行”：

- 发起登录
- 检查状态
- 完成 OAuth
- 校验 token
- 注销本地凭据
- 返回 provider 能力矩阵

---

## 五、当前能力与边界

当前已实现：

- GitHub `manual_token`
- Google `browser_oauth`
- Google `manual_refresh_token`
- 业务路由决策 `auth_resolve_route`
- GitHub 仓库 / 分支 / PR / issue 只读缺口补全
- GitHub issue / PR 第一批协作写操作
- GitHub 聊天统一入口第一阶段
- 登录状态可视化摘要
- GitHub / Gmail 状态卡
- 本地 HTML 面板 `ui_open_panel`

当前未实现：

- 官方 `@gmail/@github` 入口接管
- 在本地 MCP 中直接实现 Gmail 发信/读信
- 在本地 MCP 中直接实现 GitHub 标签修改、merge、release 等更完整写操作
- Google 业务聊天入口统一
- 面板内直接发起 GitHub / Gmail 登录

---

## 六、如何继续阅读

如果你已经理解原理，接下来建议看：

- [OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login/references/OPERATION_MANUAL.md)
- [LOGIN_STATUS_USAGE.md](D:/project/CodexWorkSpace/2026-04-29-login/references/LOGIN_STATUS_USAGE.md)
- [provider-matrix.md](D:/project/CodexWorkSpace/2026-04-29-login/references/provider-matrix.md)

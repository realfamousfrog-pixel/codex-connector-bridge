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
- 查看单个 provider 状态
- 查看业务请求应该走本地网关还是官方插件
- GitHub `manual_token` 登录
- GitHub 仓库信息读取
- GitHub 分支列表读取
- GitHub PR 列表 / 详情读取
- GitHub issue 列表 / 详情读取
- GitHub issue 创建 / 评论创建
- GitHub PR 创建 / 通用评论创建 / 评论型 review 创建
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
- 显式 `@助手` 聊天入口
- 跨项目全局复用的统一聊天入口
- 在本地 MCP 中直接实现 Gmail 发信/读信
- 在本地 MCP 中直接实现 GitHub 标签修改、merge、approve / request changes、release 等更完整写操作
- Google 业务聊天入口统一

当前接入现状：

- 项目内已提供 `mcp/service-auth-gateway/.mcp.json`
- 用户也可以在自己的全局 Codex 配置中注册 `service-auth-gateway`
- 这表示 Codex 可以从项目级或用户自己的全局配置发现该服务
- 这表示 MCP 服务可被全局发现，不表示全局聊天入口 `@助手` 已经实现
- 不表示官方 Gmail / GitHub 插件已经接管本地登录态

相关导航：

- [DOCUMENTATION_GUIDE.md](../DOCUMENTATION_GUIDE.md)
- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)
- [PUBLIC_SETUP_GUIDE.md](./PUBLIC_SETUP_GUIDE.md)
- [GITHUB_CREDENTIAL_SETUP.md](./GITHUB_CREDENTIAL_SETUP.md)
- [GOOGLE_CREDENTIAL_SETUP.md](./GOOGLE_CREDENTIAL_SETUP.md)

## 使用前提

### 环境假设

当前项目默认基于以下环境编写：

- Windows
- 已安装 `Node.js`
- 已安装 `npm`
- 推荐已安装 `Chrome`

### Chrome 说明

Google OAuth 默认支持：

- 项目内联调脚本优先显式调用 `Chrome` 打开授权链接
- 或手动复制授权 URL 到 `Chrome`

若自动拉起失败，也可以手动复制授权 URL 到浏览器。

### 当前能力边界

本项目当前是“统一认证层 + GitHub 聊天统一入口第一阶段 + 登录状态可视化原型”，不是完整业务客户端。

这意味着：

- 现在可以做登录、状态查看、状态校验、注销
- 现在可以做“业务请求该走本地还是官方”的路由判断
- 现在可以做 GitHub 缺口补全 V1 的只读业务操作
- 现在可以做 GitHub 第一批协作写操作：issue / PR 创建与评论
- 现在可以做 GitHub 最小发布链路：仓库链接预览、自动建个人仓、commit、push
- 现在可以通过 `service-auth-router` 统一接收 GitHub 自然语言请求，并按“先补参数、再判路由、写前确认”执行
- 对于 GitHub 仓库 / PR / issue 协作操作，当前采用官方优先、不可依赖时回退本地
- 现在不会在本地 MCP 中直接发 Gmail 邮件
- 现在不会在本地 MCP 中直接做 GitHub 标签修改、merge、release 等更完整写操作

### GitHub 聊天统一入口

当前 GitHub 统一聊天入口固定为：

- `skill/service-auth-router`

当前入口形态需要区分两层：

- 当前：
  - 仍由项目内 `service-auth-router` 负责编排
  - 用户主要通过自然语言触发
- 后续目标：
  - 前台显式入口收口为 `@助手`
  - 后台内部仍保持 `service-auth-router` / `service-auth-gateway`
  - 后续可补充中文别名，但当前主名以 `@助手` 为准
  - 未来目标是让该入口可在任意项目中复用，而不只限当前项目

当前已统一覆盖：

- login
- status
- validate
- logout
- repository read
- branch read
- pull request read
- issue read
- issue collaboration write
- pull request collaboration write
- current-project publish

当前交互规则：

- 先识别 GitHub 意图
- 再补齐关键参数
- 再调用 `auth_resolve_route`
- 若走本地写操作或发布执行，先输出执行摘要并等待确认

当前关键参数要求：

- GitHub 业务操作本地回退统一优先需要 `repositoryUrl`
- 发布统一需要 `projectPath`、`repositoryUrl`、`commitMessage`
- 写操作统一需要 issue / PR 编号、标题、正文、分支等必要参数

### 聊天层执行规则

当前统一聊天入口按以下规则执行：

- 登录、状态查看、校验、注销：
  - 直接走本地网关
- GitHub 读操作：
  - 参数齐全且路由明确后可直接执行
- GitHub 本地写操作：
  - 必须先输出执行摘要
  - 用户确认后才调用本地写工具
- GitHub 发布：
  - 必须先执行 `github_publish_prepare`
  - 用户确认预览后才调用 `github_publish_execute`

执行摘要至少应包含：

- 目标仓库
- 目标对象
- 即将执行的动作
- 当前为何走本地或官方路径
- 用户确认后才会调用的工具名

### 聊天层验收示例矩阵

以下示例矩阵用于收口第二步聊天入口行为，不代表官方 `@github` 已被接管。

#### 登录类

- 输入：`登录 GitHub`
  - 预期：走本地登录入口，提示开始 `manual_token` 流程
- 输入：`看看 GitHub 登没登录`
  - 预期：先看 `auth_status_overview()`，必要时再看 `auth_status({ provider: "github" })`
- 输入：`校验 GitHub token`
  - 预期：调用 `auth_validate({ provider: "github" })`
- 输入：`注销 GitHub`
  - 预期：调用 `auth_logout({ provider: "github" })`

#### 读操作类

- 输入：`看看这个仓库`
  - 缺 `repositoryUrl` 时：先追问仓库链接
  - 参数齐全时：先判 `auth_resolve_route`，再执行读操作或给官方建议
- 输入：`列出这个仓库的分支`
  - 预期：`repositoryUrl` 齐全后先判路由，再读分支列表
- 输入：`看这个 PR`
  - 缺 `pullNumber` 或 `repositoryUrl` 时：先补参数
- 输入：`看这个 issue`
  - 缺 `issueNumber` 或 `repositoryUrl` 时：先补参数

#### 写操作类

- 输入：`帮我创建 issue`
  - 预期：先补 `repositoryUrl`、标题、正文
  - 若走本地：先停在确认摘要，再调 `github_issue_create`
- 输入：`帮我评论这个 issue`
  - 预期：先补 `repositoryUrl`、`issueNumber`、正文
  - 若走本地：先停在确认摘要，再调 `github_issue_comment_create`
- 输入：`帮我创建 PR`
  - 预期：先补 `repositoryUrl`、`head`、`base`、标题、正文
  - 若走本地：先停在确认摘要，再调 `github_pull_request_create`
- 输入：`帮我评论这个 PR`
  - 预期：先补 `repositoryUrl`、`pullNumber`、正文
  - 若走本地：先停在确认摘要，再调 `github_pull_request_comment_create`
- 输入：`给这个 PR 提 review comment`
  - 预期：先补 `repositoryUrl`、`pullNumber`、正文
  - 若走本地：先停在确认摘要，再调 `github_pull_request_review_create`

#### 发布类

- 输入：`把当前项目推到这个仓库`
  - 缺 `repositoryUrl` 时：先追问
  - 缺 `commitMessage` 时：先追问
  - 参数齐全时：先走 `github_publish_prepare`
  - 预览通过后：先展示发布摘要，再等待确认

#### 阻塞类

- 未登录时：
  - 预期返回 `github_auth_required`
  - 同时给出重新登录步骤
- scope 不足时：
  - 预期返回 `github_scope_missing`
  - 同时明确需要更换具备 `repo` 或 `public_repo` 的 token
- route 结果为官方路径时：
  - 只给官方执行建议
  - 不伪装成已经由本地执行
- route 结果为本地路径时：
  - 明确将调用的本地工具名

### 当前推进顺序

当前固定推进顺序如下：

1. 先收口 GitHub MCP 业务底座
2. 再收口 GitHub 聊天统一入口第一阶段
3. 最后再判断是否可以提交主线

这里的“可以提交主线”不等于：

- 只是文档已经写完
- 只是 skill 已能统一描述
- 只是聊天窗口看起来能统一接话

只有在 MCP 能力、测试、聊天层交互规则和文档边界都收口后，才可进入主线提交判断。

### 主线提交判断

主线提交判断以 `PROJECT_CONTEXT.md` 为第一真相源。

当前必须至少满足：

- `npm test` 通过
- `npm run smoke` 通过
- GitHub 路由决策、读操作、第一批协作写操作、发布链路测试通过
- `service-auth-router` 已固定第一阶段统一范围
- 文档已明确当前未达到官方 `@github` 插件同等效果

当前能力已并入 `main`，后续若继续扩展，仍应以 `PROJECT_CONTEXT.md` 作为主线状态与能力边界的第一真相源。

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
- 若要依赖 Codex 自动发现该服务，可使用项目内 `.mcp.json`，或在自己的全局 Codex 配置中完成注册

#### 步骤

进入目录：

```powershell
cd .\mcp\service-auth-gateway
```

启动服务：

```powershell
npm start
```

#### 结果

- 本地 `service-auth-gateway` MCP 服务启动
- 后续可接收 MCP 工具调用
- 若已通过项目级 manifest 或自己的全局配置完成注册，Codex 重新加载配置后也可发现该服务

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

### 查看业务操作路由决策

#### 前提

- MCP 服务已可调用

#### 步骤

查看 GitHub 业务请求：

```text
auth_resolve_route({
  provider: "github",
  intent: "business_operation",
  capabilityBundle: "github-basic",
  operationName: "pull_request_list",
  repositoryUrl: "https://github.com/<owner>/<repo>"
})
```

查看 Google Drive 业务请求：

```text
auth_resolve_route({
  provider: "google",
  intent: "business_operation",
  capabilityBundle: "drive-basic",
  operationName: "open_drive_file"
})
```

查看当前项目 GitHub 发布：

```text
auth_resolve_route({
  provider: "github",
  intent: "publish"
})
```

#### 结果

会返回：

- 当前目标 provider
- 所需 capability bundle
- 当前本地登录状态
- 应该走 `use_local_auth_gateway`、`use_official_connector` 还是 `auth_blocked_with_reason`
- 下一步应该先登录、先校验，还是直接切到官方插件

#### 当前规则

- 登录、状态查看、校验、注销：
  - 走本地网关
- GitHub 当前项目发布：
  - 走本地网关
- GitHub 仓库 / 分支 / PR / issue 读操作：
  - 官方可依赖时优先官方 `@github`
  - 官方在当前环境不可依赖时回退本地 GitHub 工具
- GitHub issue / PR 协作写操作：
  - 官方可依赖时优先官方 `@github`
  - 官方在当前环境不可依赖时回退本地 GitHub 工具
- Gmail / Drive / Docs / Sheets / Slides 等业务操作：
  - 本地认证满足后优先走官方 `@gmail` 或 `@google-drive`

#### 聊天层约束

- GitHub 业务请求应先经过聊天层参数补齐，不应在缺关键参数时直接调用本地工具
- GitHub 本地读操作在参数齐全后可直接执行
- GitHub 本地写操作和发布执行必须先经过聊天层统一二次确认
- 工具级 `confirm=true` 仍需要保留，但它不是用户主交互入口

### GitHub 只读业务操作

#### 适用范围

- 当前这一节只覆盖 GitHub 只读操作
- `repositoryUrl` 当前必填

#### 仓库信息

```text
github_repository_get({
  repositoryUrl: "https://github.com/<owner>/<repo>"
})
```

#### 分支列表

```text
github_branch_list({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  limit: 20
})
```

#### PR 列表

```text
github_pull_request_list({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  state: "open",
  limit: 20
})
```

#### PR 详情

```text
github_pull_request_get({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  pullNumber: 12
})
```

#### issue 列表

```text
github_issue_list({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  state: "open",
  limit: 20
})
```

#### issue 详情

```text
github_issue_get({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  issueNumber: 7
})
```

#### 返回特点

- 统一使用本地 GitHub token
- 未登录时返回阻塞结果
- 仓库不存在、PR 不存在、issue 不存在会返回明确原因
- issue 列表会自动过滤 PR 镜像项

### GitHub 协作写操作

#### 适用范围

- 当前第一批只覆盖 issue / PR 创建与评论协作
- `repositoryUrl` 当前必填
- 写操作当前必须传 `confirm: true`
- 本地 token 当前需要具备 `repo` 或 `public_repo`
- PR review 当前只支持评论型 `COMMENT`

#### issue 创建

```text
github_issue_create({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  title: "Issue title",
  body: "Issue body",
  confirm: true
})
```

#### issue 评论创建

```text
github_issue_comment_create({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  issueNumber: 7,
  body: "Issue comment",
  confirm: true
})
```

#### PR 创建

```text
github_pull_request_create({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  title: "PR title",
  body: "PR body",
  head: "feature/login",
  base: "main",
  confirm: true
})
```

#### PR 通用评论创建

```text
github_pull_request_comment_create({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  pullNumber: 12,
  body: "PR comment",
  confirm: true
})
```

#### PR 评论型 review 创建

```text
github_pull_request_review_create({
  repositoryUrl: "https://github.com/<owner>/<repo>",
  pullNumber: 12,
  body: "Review comment",
  confirm: true
})
```

#### 返回特点

- 官方 GitHub connector 不可依赖时，可走本地回退
- scope 不足时会返回 `github_scope_missing`
- 仓库、issue、PR 不存在会返回明确阻塞原因
- 403 / 422 会映射为稳定的本地阻塞结果

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

- [LOGIN_STATUS_USAGE.md](./LOGIN_STATUS_USAGE.md)

当前状态含义如下：

- `unauthenticated`
  - 当前没有本地保存的登录信息
- `saved`
  - 本地 secret 已存在，但还没有恢复成完整状态；可以继续校验恢复
- `authenticated`
  - 当前已校验且可用
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
- 你的 Codex 全局配置中是否仍存在 `mcp_servers.service-auth-gateway`

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

- 业务操作路由决策 `auth_resolve_route`
- 仓库信息读取
- 分支列表读取
- PR 列表 / 详情读取
- issue 列表 / 详情读取
- issue 创建 / 评论创建
- PR 创建 / 通用评论创建 / 评论型 review 创建
- 仓库链接发布预览
- 仓库自动创建、commit、push

后续待补充：

- GitHub 标签修改、merge、approve / request changes、release 等后续写操作
- 更细的 route intent
- Google 业务层缺口补全

### 登录状态可视化面板

当前已实现：

- 本地 HTML 面板 `ui_open_panel`

当前未实现：

- 更完整桌面级 UI

### 官方 `@gmail/@github` 兼容

远期探索，当前不承诺

### 显式 `@助手` 入口

当前未实现：

- 还不能要求用户通过显式 `@助手` 才能进入统一聊天入口
- 当前也还没有真正的全局聊天入口

后续目标：

- 前台统一入口收口为 `@助手`
- 后台内部继续保持 `service-auth-router` / `service-auth-gateway`
- 后续可补充中文别名，但不改变内部实现名
- 未来让该入口可跨项目全局复用

# 项目规则

项目发生代码、配置、脚本、结构、流程或约束变更时，必须同步更新本说明文档。
当前项目采用 Git 主线 + worktree 协作时，worktree 只承载代码和文档，不承载本地登录态或运行态认证文件。

# 项目概况

本项目是一个面向 Codex 本地环境的统一登录原型，目标是在当前 API 路线下，为 `GitHub` 和 `Google` 提供一套可复用的本地认证入口，并用 `skill + MCP` 两层结构统一处理登录状态、登录流程、业务能力缺口补全和后续路由决策。

当前项目不尝试接管或复用官方云端 connector 的内部登录态，而是提供本地可控的替代认证层。

## 最终目标

- 长期目标：
  - 形成可持久保存认证信息的本地统一登录与操作底座，重启电脑或重启 Codex 后仍能恢复可用状态
- 体验目标：
  - 在普通聊天、自定义 skill、MCP 工具入口中，实现与官方 Gmail / GitHub 插件接近的等效体验
- GitHub 发布目标：
  - 在完成本地 GitHub 认证后，支持从当前工作区直接面向指定 GitHub 仓库执行发布准备与推送
  - 目标体验是用户只需提供仓库地址或目标仓库信息，系统即可完成仓库校验、git 初始化或绑定、提交与 push
  - 若后续扩展到 GitHub Pages、Actions 或其他平台发布，应明确区分“推送到仓库”和“部署到运行平台”两类能力
- 可视化目标：
  - 第一版实现登录状态可视化
  - 后续再升级为可点击发起登录、查看账号、注销的本地登录面板
- 兼容目标：
  - 官方 `@gmail/@github` 入口只作为远期探索方向，不作为当前阶段承诺

## 当前阶段重点

- 当前主线已经并入 GitHub MCP 业务底座、GitHub 聊天统一入口第一阶段，以及体验层状态卡和本地面板能力。
- 当前统一入口继续复用 `skill/service-auth-router/`，不新增并列 GitHub skill。
- 当前统一范围固定为：
  - GitHub login
  - GitHub status / validate / logout
  - GitHub repository / branch / PR / issue 读操作
  - GitHub issue / PR 第一批协作写操作
  - current-project publish
  - GitHub / Gmail 状态卡与本地状态面板
- Google 业务聊天入口当前仍未并入统一闭环。

## 当前工作路线

当前主线后的优先级如下：

1. 保持当前 GitHub 业务底座、聊天统一入口和体验层能力稳定
2. 默认只接受：
   - bug 修复
   - 文档漂移修复
   - 必要的接入状态同步
3. 后续若继续扩展，再按以下顺序推进：
   - GitHub 后续写操作
   - Google 业务层缺口补全
   - 更完整的本地面板体验

## 主线收口结果

本轮主线收口已经完成，当前主线达成的稳定条件如下：

- MCP 新增工具接口已稳定在当前 V1 范围：
  - `auth_resolve_route`
  - `github_repository_get`
  - `github_branch_list`
  - `github_pull_request_list`
  - `github_pull_request_get`
  - `github_issue_list`
  - `github_issue_get`
  - `github_issue_create`
  - `github_issue_comment_create`
  - `github_pull_request_create`
  - `github_pull_request_comment_create`
  - `github_pull_request_review_create`
  - `github_publish_prepare`
  - `github_publish_execute`
- `npm test` 通过
- `npm run smoke` 通过
- GitHub 业务层新增测试已覆盖：
  - 路由决策
  - GitHub 读操作
  - GitHub 第一批协作写操作
  - scope 不足阻塞
  - 未登录阻塞
  - 发布仍走本地网关
- `service-auth-router` 已明确第一阶段统一范围与非目标
- 主文档、README、操作手册已经同步：
  - 当前已实现
  - 当前未实现
  - 当前统一到哪一层
  - 当前仍未达到官方 `@github` 插件同等效果
- 当前主线代码、测试和主文档已经对齐
- 当前阶段不再使用 `ready_for_mainline` 这类“准备并主线”状态描述，而直接以主线真实状态为准

## 第二步完成标准

GitHub 聊天统一入口第一阶段只有在以下条件全部满足时，才可视为“第二步完成”：

- `skill/service-auth-router/` 已固定为唯一 GitHub 自然语言入口
- 不新增并列 GitHub skill
- 不新增 MCP 工具
- 不修改当前 GitHub V1 工具 schema
- 聊天层规则已经固定为：
  - 先补参数
  - 再判路由
  - 写前确认
- route 输出已经固定为统一契约：
  - `use_official_connector`
  - `use_local_auth_gateway`
  - `auth_blocked_with_reason`
- `service-auth-router` 已补齐聊天层示例矩阵，至少覆盖：
  - 登录类
  - 状态类
  - GitHub 读操作
  - GitHub 写操作
  - publish
  - 缺参数追问
  - blocked 恢复
- 操作手册已明确以下边界：
  - 哪些请求会直接执行
  - 哪些请求会先停在确认摘要
  - 当前仍未达到官方 `@github` 插件同等效果
- README、主文档、操作手册、skill 说明之间不存在边界冲突或状态倒挂
- 第二步收口结果当前已经并入主线

## 环境假设

- 当前用户机器只有 `Chrome`
- Google OAuth 当前优先按“显式调用本机 Chrome，必要时再手动复制到 Chrome”设计

# 当前结论

## 官方插件现状

- 当前 Codex 使用 `API` 路线工作，不具备 ChatGPT 云账号 connector 登录能力。
- 官方 `@gmail`、`@google-drive`、`@github` 插件即使本地已安装，也不等于当前环境下可直接完成登录。
- 本项目的处理策略是：
  - 能明确使用官方 connector 且当前环境可直接完成的场景，给出 `use_official_connector`
  - 官方 connector 因未登录或当前线程内工具面不可稳定验证而不可依赖时，转到本地 `service-auth-gateway`
  - 当前发展顺序固定为：先 `GitHub`，后 `Google`

## 本地统一登录原型现状

当前已经完成一版可运行的本地统一登录原型，并且 `service-auth-gateway` 已注册到全局 Codex MCP 配置，覆盖：

- `GitHub`
- `Google`
  - `gmail-basic`
  - `drive-basic`

当前认证能力如下：

- `GitHub`
  - 支持 `manual_token`
  - 通过 GitHub API 校验 token 是否有效
  - 已完成至少一次真实 token 联调并验证可写入本地凭据存储
  - 已修复仅有 secret、缺少 provider state 时 `auth_validate` 无法恢复的问题
  - 已补业务路由决策接口：
    - `auth_resolve_route`
  - 已补 GitHub 缺口补全 V1 只读业务工具：
    - `github_repository_get`
    - `github_branch_list`
    - `github_pull_request_list`
    - `github_pull_request_get`
    - `github_issue_list`
    - `github_issue_get`
  - 已补 GitHub 第一批协作写操作工具：
    - `github_issue_create`
    - `github_issue_comment_create`
    - `github_pull_request_create`
    - `github_pull_request_comment_create`
    - `github_pull_request_review_create`
  - 对于仓库、PR、issue、CI 等业务操作，当前策略是：
    - 若官方插件在当前环境可直接完成，则优先官方 `@github`
    - 若官方插件因未登录或工具面不可稳定验证而不可依赖，则回退到本地 GitHub 业务工具
  - 已实现 GitHub 发布准备与执行原型：
    - `github_publish_prepare`
    - `github_publish_execute`
  - 当前支持“提供 GitHub 仓库链接后，将当前项目推送到当前已登录个人账号名下仓库”
- `Google`
  - 支持 `browser_oauth`
  - 支持 `manual_refresh_token`
  - 浏览器 OAuth 当前按 `localhost` loopback 回调处理
  - 浏览器 OAuth 当前已补 `PKCE (S256)` 与 `select_account`
  - 项目内联调脚本当前优先显式调用本机 `Chrome`
  - 对 Google token 交换与 refresh，当前已补 Windows PowerShell 网络回退以兼容部分主机上的 Node 连接超时
  - 已完成至少一次真实 `browser_oauth` 联调并验证可写入本地凭据存储
  - 已补业务路由决策接口：
    - `auth_resolve_route`
  - 当前 `Google` 仍处于第二阶段，尚未开始本地业务层缺口补全
  - 对于 Gmail / Drive / Docs / Sheets / Slides 等业务操作，当前仍优先按官方 `@gmail` / `@google-drive` 判断
  - 登录状态可视化
    - 支持结构化状态摘要输出
  - 本地可视化面板
    - 已支持 `ui_open_panel`
    - 当前面板可查看登录总览，并提供 GitHub 发布入口

当前接入形态需要区分两层事实：

- 项目内已经提供本地 MCP manifest：
  - `mcp/service-auth-gateway/.mcp.json`
- 当前用户环境中还额外完成了全局 Codex MCP 注册：
  - `C:\Users\86175\.codex\config.toml`
  - `mcp_servers.service-auth-gateway`

这表示该原型既可以作为项目内本地 MCP 原型独立运行，也已经在当前用户机器上被 Codex 从全局配置发现。

## GitHub 发布能力边界

- 当前已实现：
  - GitHub `manual_token` 认证与有效性校验
  - 登录状态查看、校验与本地凭据管理
  - 面向业务层的本地路由决策：
    - `auth_resolve_route`
    - 可区分 login / status / validate / logout / publish / business_operation
  - GitHub 缺口补全 V1：
    - 仓库信息读取
    - 分支列表读取
    - PR 列表 / 详情读取
    - issue 列表 / 详情读取
    - issue 创建
    - issue 评论创建
    - PR 创建
    - PR 通用评论创建
    - PR 评论型 review 创建
    - `repositoryUrl` 必填
    - 写操作要求 `confirm=true`
    - PR review 第一版仅支持评论型 `COMMENT`
  - 基于仓库链接的 GitHub 发布准备：
    - 校验当前 GitHub 登录
    - 校验仓库 owner 是否属于当前已登录个人账号
    - 检查目标仓库是否存在、是否为空仓、是否允许自动创建
    - 检查当前项目 git 状态、`origin` 状态与待提交预览
  - 基于仓库链接的 GitHub 发布执行：
    - 仓库不存在时可自动创建个人仓库
    - 非 git 目录可自动 `git init`
    - 首次提交默认使用 `main`
    - 自动绑定干净 HTTPS `origin`
    - 使用用户提供的 commit message 完成 commit 与 push
- 当前未实现：
  - 在本地 MCP 内直接执行 GitHub 标签修改、merge、approve / request changes、release 等更完整写操作
  - 在本地 MCP 内直接执行 GitHub Pages、Actions 等更完整业务 API
  - 组织仓库创建与发布
  - 非空远端自动合并、pull、rebase、force push
  - 仅凭自然语言在输入框中达到官方 `@github` 等效体验
- 规划中但尚未交付：
  - 为 GitHub 补更多业务场景下的 route intent 与恢复指引
  - 在 GitHub 缺口补全稳定后，再进入 Google 业务层补全
- 远期探索方向：
  - 更接近官方 `@github` 使用体验的一体化发布入口

# 项目结构

项目根目录当前关键内容如下：

- `PROJECT_CONTEXT.md`
  - 项目主说明文档，也是持续维护上下文主入口
- `DOCUMENTATION_GUIDE.md`
  - 项目全部说明文档的导航页
- `README.md`
  - 项目简要入口说明
- `CODEX_TASK_README.md`
  - 本次任务目录约束，不作为项目主说明文档
- `skill/service-auth-router/`
  - 统一登录 skill
- `mcp/service-auth-gateway/`
  - 本地 MCP 认证网关原型
  - 包含项目内 MCP manifest：`.mcp.json`
- `references/MCP_AND_PROJECT_GUIDE.md`
  - 面向新手的 MCP 与项目详细介绍
- `references/provider-matrix.md`
  - provider 与 capability bundle 对照说明
- `references/OPERATION_MANUAL.md`
  - 项目正式操作手册，面向实际使用与后续扩写

## 统一 Skill

`skill/service-auth-router/` 负责：

- 作为当前项目唯一的 GitHub 自然语言聊天入口
- 识别用户是在请求登录、查看登录状态、校验、推送发布、切换账号、注销，还是在做仓库 / 分支 / PR / issue 读写操作
- 识别目标服务是 `github` 还是 `google`
- 对 GitHub 请求先分类意图、再补参数、再判断走官方 connector 还是本地 `MCP` 网关
- 在本地写操作和发布执行前，先给出聊天层统一二次确认摘要
- 对下游给出统一结论：
  - `use_official_connector`
  - `use_local_auth_gateway`
  - `auth_blocked_with_reason`

当前 GitHub 聊天层统一规则如下：

- GitHub 业务请求统一先过：
  - `auth_resolve_route`
- 缺少关键参数时，先补问，不直接盲调底层工具
- 本地 GitHub 读操作在参数齐全且路由明确后可直接执行
- 本地 GitHub 写操作和发布执行必须先经过聊天层统一二次确认
- 工具级 `confirm=true` 仍保留，但只作为底层保护，不作为主交互心智

## 本地 MCP 网关

`mcp/service-auth-gateway/` 当前实现的工具接口包括：

- `auth_list_providers`
- `auth_status`
- `auth_status_overview`
- `auth_status_cards`
- `auth_refresh_status_card`
- `auth_begin`
- `auth_complete`
- `auth_validate`
- `auth_logout`
- `auth_capability_matrix`
- `auth_resolve_route`
- `github_repository_get`
- `github_branch_list`
- `github_pull_request_list`
- `github_pull_request_get`
- `github_issue_list`
- `github_issue_get`
- `github_issue_create`
- `github_issue_comment_create`
- `github_pull_request_create`
- `github_pull_request_comment_create`
- `github_pull_request_review_create`
- `github_publish_prepare`
- `github_publish_execute`
- `ui_open_panel`

支持的 provider 固定为：

- `github`
- `google`

支持的 capability bundle 固定为：

- `github-basic`
- `gmail-basic`
- `drive-basic`

# 运行与验证

本地运行入口：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login\mcp\service-auth-gateway
npm start
```

测试命令：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login\mcp\service-auth-gateway
npm test
```

MCP smoke test：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login\mcp\service-auth-gateway
npm run smoke
```

当前已验证通过：

- `npm test`
- `npm run smoke`

## 登录状态可视化

当前“可视化登录”已包含两种形态：

- 结构化状态可视化：
  - `auth_status_overview()`
  - `auth_status_cards()`
- 本地 HTML 面板：
  - `ui_open_panel()`

推荐入口：

```text
auth_status_overview()
```

它用于查看：

- provider
- 当前状态
- 当前账号
- 已授权 bundles
- 上次校验时间
- 下一步建议动作

如果要查看面向体验层的 GitHub / Gmail 状态卡，推荐使用：

```text
auth_status_cards()
```

对应的单卡在线刷新入口：

```text
auth_refresh_status_card({ cardId: "github" })
auth_refresh_status_card({ cardId: "gmail" })
```

本地 HTML 面板当前支持：

- 首屏显示 GitHub / Gmail 缓存摘要，再自动执行在线校验
- 手动刷新 GitHub / Gmail 单张状态卡
- GitHub 卡片账号优先显示 GitHub name，缺少时回退为 `@login`
- Gmail 卡片账号优先显示 Gmail profile 邮箱，拿不到时回退到 Google profile email
- 注销 GitHub 本地凭据
- 当前不支持面板内 Gmail 注销
- 输入仓库链接、commit message 并执行 GitHub 发布预览 / 发布
- 预览区显示待提交文件扁平列表，执行后结果区保留发布结果或阻塞原因

# 凭据与状态

秘密信息与元数据分离：

- 正常运行时：
  - token、refresh token、client secret 存入 Windows Credential Manager
- 测试模式下：
  - 使用环境变量模拟 secret 存储
- 测试隔离：
  - 自动化测试当前使用独立测试数据目录，不再复用真实 `data/` 目录
  - 测试侧重置 `state.json` / `sessions.json` 时已改为原子写入，避免测试初始化阶段生成空文件或半写入文件
- 非敏感状态写入：
  - `mcp/service-auth-gateway/data/state.json`
  - `mcp/service-auth-gateway/data/sessions.json`

状态文件只承担原型调试与流程跟踪用途，不应写入敏感 token 明文。
当前 `state-store` 已补以下稳定性约束：

- `state.json` / `sessions.json` 写入采用临时文件替换，避免直接覆盖时被读到半写入内容
- 同进程内对同一状态文件的更新已串行化，避免并发写入互相覆盖或产出损坏 JSON
- 读取状态文件时，对空文件、缺失文件提供短重试与回退恢复，降低测试阶段 `Unexpected end of JSON input` 的间歇性失败风险

## 版本控制约束

- `mcp/service-auth-gateway/data/` 下的真实运行态文件默认不进入版本控制
- worktree 间不共享或提交某一台机器上的本地认证状态
- 如需保留结构说明，应使用示例文件或目录说明，而不是提交真实状态文件

# 当前限制

- 本项目当前仍以“项目内原型”为主进行开发和维护，但 `service-auth-gateway` 已接入全局 Codex MCP 配置。
- 本项目当前仍未实现官方 `@gmail/@github` 入口接管。
- 当前已实现 GitHub 最小发布链路、业务路由决策和 GitHub 缺口补全 V1，且当前统一入口阶段只覆盖 GitHub，不覆盖 Google 业务聊天闭环。
- Google 浏览器 OAuth 已支持本地 loopback 回调，但仍依赖用户提供有效的 OAuth client 信息。
- GitHub 当前只做 `manual_token` 路径，不依赖 `gh auth login`，也未实现 GitHub 浏览器 OAuth。
- 默认每个 provider 只维护一个活动账号，多账号切换未实现。
- 本项目不会把本地认证结果写回官方插件登录态。
- 对于 GitHub 仓库 / PR / issue 协作操作，本项目当前采用“官方优先、保守回退到本地”的策略；当前线程内无法稳定暴露官方 GitHub connector 工具面时，会按保守策略回退本地实现。
- GitHub 本地协作写操作当前要求 token 具备 `repo` 或 `public_repo` 范围；若 scope 不足，会返回 `github_scope_missing`。
- GitHub MCP 业务底座第一阶段当前固定阻塞语义至少包括：
  - `github_auth_required`
  - `github_scope_missing`
  - `repository_not_found`
  - `issue_not_found`
  - `pull_request_not_found`
  - `github_repo_access_denied`
- 对于 Google 业务操作，当前尚未进入本地业务层缺口补全阶段。
- GitHub 聊天统一入口第一阶段当前仍未覆盖标签修改、merge、approve / request changes、release 等更完整写操作。
- GitHub 聊天统一入口第一阶段当前仍要求业务操作明确提供 `repositoryUrl`，发布明确提供 `commitMessage` 并在预览后确认。
- 即使后续接入 Codex 设置中的 MCP 管理，也不等于 Codex 原生会显示“Gmail 已登录 / GitHub 已登录”的平台级登录面板。
- 当前面板中的 Gmail 状态卡只是 `google + gmail-basic` 的本地在线校验，不代表官方 Gmail connector 登录态。
- 当前面板只覆盖状态查看与 GitHub 发布入口，不提供完整业务操作面板。
- GitHub 发布 v1 当前只支持当前已登录个人账号名下仓库，不支持组织仓库。
- GitHub 发布 v1 当前要求用户显式提供 commit message，并在预览后确认。
- GitHub 发布 v1 当前不处理非空远端自动合并、pull、rebase、force push、子模块或 LFS。

## 全局接入现状

当前已完成的全局接入：

- `service-auth-gateway` 已写入 `C:\Users\86175\.codex\config.toml`
- 项目内同时保留独立 manifest：
  - `mcp/service-auth-gateway/.mcp.json`
- 当前全局 MCP 配置中已存在：
  - `mcp_servers.service-auth-gateway`
- 当前需要注意：
  - `C:\Users\86175\.codex\config.toml` 里的全局 `service-auth-gateway` 仍指向旧路径 `D:\project\CodexWorkSpace\2026-04-29-login\...`
  - 这属于用户环境现状，不应误写为仓库外全局配置已自动同步到新的 worktree 或分支路径

这表示：

- Codex 已可从全局配置发现此 MCP 服务
- 这属于 MCP 服务注册，而不是官方 connector 登录态接管
- 项目内 manifest 与当前用户机器上的全局注册可以分别存在
- 不等于官方 Gmail / GitHub 插件已经接管本地登录态

# 后续建议

如果继续推进，优先级建议如下：

1. 先保持当前主线实现冻结：
   - 不继续扩 GitHub / Google 新能力
   - 只接受 bug 修复、漂移修复和必要文档修正
2. 主线稳定后，再评估：
   - GitHub 标签、merge、release 等后续写操作
   - Google 业务层缺口补全

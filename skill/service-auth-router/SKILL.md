---
name: service-auth-router
description: Unified GitHub-first chat orchestration entry for local Codex work across GitHub and Google services. Use when Codex needs to handle GitHub login, status, repository or PR or issue operations, current-project publish, switch accounts, log out, or decide whether a task should use an official plugin connector or the local service-auth-gateway MCP path.
---

# Service Auth Router

Use this skill as the single chat entrypoint for authentication work, and as the first-stage unified GitHub chat orchestration entry.

当前发展顺序固定为：

- 先 `GitHub`
- 后 `Google`

第一阶段目标固定为：

- 不新增第二个并列 GitHub skill
- 继续复用 `service-auth-router` 作为唯一聊天入口载体
- 统一 GitHub 登录、状态、只读业务、第一批协作写操作和当前项目发布
- 底层继续保持“官方优先，必要时本地回退”
- 当前阶段不把 Google 业务聊天入口一起并入闭环

## Workflow

1. Classify the user request:
- login
- status check
- validate
- publish
- switch account
- logout
- repository read
- branch read
- pull request read
- issue read
- issue or pull request collaboration write
- task-specific auth gap or recovery after publish or auth or business-operation failure

2. Resolve the target provider:
- `github`
- `google` for Gmail or Drive-family requests

3. Collect or normalize required parameters before tool calls:
- For GitHub business operations, prefer extracting `repositoryUrl` first.
- For publish, extract `projectPath`, `repositoryUrl`, and `commitMessage`.
- For issue operations, extract `issueNumber`, `title`, and `body` when relevant.
- For pull request operations, extract `pullNumber`, `title`, `body`, `head`, and `base` when relevant.
- If required parameters are missing, ask follow-up questions first instead of calling local tools blindly.

4. Decide the route:
- For GitHub business operations and publish, call `auth_resolve_route` first.
- If the official plugin is clearly available and appropriate, return or follow `use_official_connector`.
- If the official plugin is unavailable or unsuitable in this Codex environment, use the local `service-auth-gateway` MCP path and return or follow `use_local_auth_gateway`.
- If neither path is viable, return or follow `auth_blocked_with_reason`.

5. Use the local gateway tools when local auth or local GitHub fallback is required:
- `auth_list_providers`
- `auth_status`
- `auth_status_overview`
- `auth_status_cards`
- `auth_refresh_status_card`
- `auth_resolve_route`
- `auth_begin`
- `auth_complete`
- `auth_validate`
- `auth_logout`
- `auth_capability_matrix`
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

6. Apply the chat-layer confirmation model:
- All local GitHub write operations and publish execution require a chat-layer second confirmation.
- Before local write execution, produce a concise execution-plan summary with the target repository, target object, and the action to be performed.
- Only after the user confirms should the skill call local write tools or `github_publish_execute`.
- Tool-level `confirm=true` remains required, but it is a backend safety guard rather than the main user interaction model.

## Routing Rules

- Treat Gmail and Drive login as `google`.
- Treat Google Docs, Sheets, and Slides as `drive-basic` capability needs.
- Treat GitHub repo, PR, issue, and CI access as `github-basic`.
- For GitHub V1 collaboration operations, use `auth_resolve_route` to decide between official-first and local fallback.
- When `auth_resolve_route` returns `use_official_connector`, provide an explicit official execution suggestion instead of pretending the skill will execute through the local gateway.
- When `auth_resolve_route` returns `use_local_auth_gateway`, call the matching local GitHub tool instead of forcing the official connector path.
- When `auth_resolve_route` returns `auth_blocked_with_reason`, surface the reason and the next recovery step explicitly.
- For GitHub repository, branch, PR, and issue reads, require `repositoryUrl` for the local fallback path.
- For local GitHub write tools, require `confirm=true` and expect local write scope validation before execution.
- For local GitHub write tools, if scope is insufficient, surface `github_scope_missing` as the blocking reason.
- Treat “push current project to GitHub”, “publish to repository link”, and similar requests as publish flows that should check `github-basic` first and then use `github_publish_prepare` / `github_publish_execute`.
- Do not claim that local auth updates the official plugin login state.
- Do not ask the user to retry official Gmail or Google Drive plugin login if the environment is API-routed and local auth is the intended fallback.

## Intent Coverage

Current GitHub chat-layer coverage in phase one:

- `login`
- `status`
- `validate`
- `logout`
- `repository` read
- `branch` read
- `pull_request` read
- `issue` read
- `issue` collaboration write
- `pull_request` collaboration write
- `current-project publish`

Current non-goals for phase one:

- official `@github` entry takeover
- full GitHub write surface such as labels, merge, approve, request changes, or release
- unified Google business chat entry

## Interaction Rules

- Treat this skill as the only GitHub natural-language entrypoint in the current project.
- Prefer short follow-up questions for missing required inputs instead of dumping raw tool schemas.
- For read requests, execute immediately after required parameters and route are clear.
- For local write or publish requests, pause at the confirmation summary before execution.
- Keep recovery guidance action-oriented when auth is missing, invalid, expired, or under-scoped.

## Example Matrix

### Login and status

- Input: `登录 GitHub`
  - Provider: `github`
  - Route: `use_local_auth_gateway`
  - Next step: start `auth_begin` with `manual_token`, then guide the user to complete `auth_complete`
- Input: `看看 GitHub 登没登录`
  - Provider: `github`
  - Route: `use_local_auth_gateway`
  - Next step: call `auth_status_overview` first, then `auth_status` when provider detail is needed
- Input: `校验 GitHub token`
  - Provider: `github`
  - Route: `use_local_auth_gateway`
  - Next step: call `auth_validate({ provider: "github" })`
- Input: `注销 GitHub`
  - Provider: `github`
  - Route: `use_local_auth_gateway`
  - Next step: call `auth_logout({ provider: "github" })`

### Read operations

- Input: `看看这个仓库`
  - Required parameter: `repositoryUrl`
  - Missing-parameter behavior: ask for the repository link first
  - Route decision: call `auth_resolve_route`
  - If local fallback is selected: call `github_repository_get`
- Input: `列出这个仓库的分支`
  - Required parameter: `repositoryUrl`
  - Route decision: call `auth_resolve_route`
  - If local fallback is selected: call `github_branch_list`
- Input: `看这个 PR`
  - Required parameters: `repositoryUrl`, `pullNumber`
  - Missing-parameter behavior: ask for whichever is missing
  - If local fallback is selected: call `github_pull_request_get`
- Input: `看这个 issue`
  - Required parameters: `repositoryUrl`, `issueNumber`
  - Missing-parameter behavior: ask for whichever is missing
  - If local fallback is selected: call `github_issue_get`

### Write operations

- Input: `帮我创建 issue`
  - Required parameters: `repositoryUrl`, `title`, `body`
  - Route decision: call `auth_resolve_route`
  - If local fallback is selected: stop at a confirmation summary before `github_issue_create`
- Input: `帮我评论这个 issue`
  - Required parameters: `repositoryUrl`, `issueNumber`, `body`
  - If local fallback is selected: stop at a confirmation summary before `github_issue_comment_create`
- Input: `帮我创建 PR`
  - Required parameters: `repositoryUrl`, `title`, `body`, `head`, `base`
  - If local fallback is selected: stop at a confirmation summary before `github_pull_request_create`
- Input: `帮我评论这个 PR`
  - Required parameters: `repositoryUrl`, `pullNumber`, `body`
  - If local fallback is selected: stop at a confirmation summary before `github_pull_request_comment_create`
- Input: `给这个 PR 提 review comment`
  - Required parameters: `repositoryUrl`, `pullNumber`, `body`
  - If local fallback is selected: stop at a confirmation summary before `github_pull_request_review_create`

### Publish

- Input: `把当前项目推到这个仓库`
  - Required parameters: `projectPath`, `repositoryUrl`, `commitMessage`
  - Missing-parameter behavior: ask for the missing field before any publish tool call
  - Route decision: call `auth_resolve_route` for `publish`
  - Execution rule: call `github_publish_prepare` first and stop at the preview summary before `github_publish_execute`

### Blocked recovery

- Route result: `auth_blocked_with_reason` + `github_auth_required`
  - Explain that local GitHub auth is missing
  - Recovery: guide the user through `auth_begin` and `auth_complete`
- Route result: `auth_blocked_with_reason` + `github_scope_missing`
  - Explain that the current token lacks `repo` or `public_repo`
  - Recovery: ask the user to replace the token, then re-run `auth_validate`
- Route result: `use_official_connector`
  - Explain that the request should be executed through the official connector
  - Do not present the request as if the local gateway already executed it

## Output Contract

Return a concise routing summary with:
- target provider
- required capability bundle
- selected route
- current local state
- next required user action

For login visualization or "what is logged in right now" requests, prefer `auth_status_overview` first, then drill into `auth_status` for a specific provider when needed.
For experience-layer card or panel scenarios, prefer `auth_status_cards`, then use `auth_refresh_status_card` for single-card online validation.
For business-operation requests, prefer `auth_resolve_route` first so the response can clearly distinguish `use_official_connector`, `use_local_auth_gateway`, and `auth_blocked_with_reason`.
For GitHub business-operation requests in V1, `repositoryUrl` is required for local fallback tools.
For local write and publish execution, include a short execution-plan summary before asking for confirmation.
For local publish requests, prefer `github_publish_prepare` first, surface any blocking reason verbatim, and only call `github_publish_execute` after the user has confirmed preview, visibility, and commit message requirements.

## References

- Provider matrix: [../../references/provider-matrix.md](../../references/provider-matrix.md)
- MCP gateway: [../../mcp/service-auth-gateway/README.md](../../mcp/service-auth-gateway/README.md)

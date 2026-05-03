# GitHub 凭证获取与配置指南

## 目标

这份文档说明如何为当前项目准备 GitHub 凭证。

当前项目使用的是：

- GitHub personal access token

它用于：

- 校验当前 GitHub 登录
- 读取仓库 / 分支 / PR / issue
- 执行 issue / PR 第一批协作写操作
- 为当前项目自动建仓、commit、push

## 为什么当前项目需要 GitHub PAT

当前 Codex 在 API 登录路线与当前本地环境下，官方 GitHub 插件登录能力失效或不可稳定依赖。

因此，这个项目需要你提供自己的 GitHub PAT，作为本地 MCP 网关的认证来源。

## 先选哪种 token

当前建议顺序如下：

1. 先尝试 fine-grained personal access token
2. 如果你在建仓、写操作或仓库权限上遇到限制，再改用 classic PAT

原因：

- GitHub 官方目前优先推荐 fine-grained token
- 但当前项目的一些 GitHub 操作仍可能在某些场景下更容易用 classic PAT 跑通

官方参考：

- GitHub Docs：
  - [Managing your personal access tokens](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token)
  - [Create a repository for the authenticated user](https://docs.github.com/en/rest/repos/repos?apiVersion=latest)

## 方案一：fine-grained PAT

### 适用场景

适合：

- 主要访问你自己名下的个人仓库
- 希望权限尽量小
- 希望优先按 GitHub 当前推荐方式配置

### 创建步骤

1. 登录 GitHub
2. 点击右上角头像
3. 进入 `Settings`
4. 左侧进入 `Developer settings`
5. 进入 `Personal access tokens`
6. 进入 `Fine-grained tokens`
7. 点击 `Generate new token`
8. 填写：
   - Token name
   - Expiration
   - Description（可选）
9. 在 `Resource owner` 中选择你自己的个人账号
10. 在 `Repository access` 中选择：
   - 如果你只想管几个仓库：`Only select repositories`
   - 如果你要让当前项目能自动创建新仓库或管理更多个人仓库：优先选覆盖你目标仓库范围的访问方式
11. 在 `Permissions` 中至少给出当前项目所需权限
12. 点击 `Generate token`
13. 立即复制 token 并保存

### 当前项目建议权限

如果你希望当前项目的 GitHub 功能尽量完整可用，建议至少准备这些 repository permissions：

- `Administration: Write`
  - 用于自动创建个人仓库
- `Contents: Read and write`
  - 用于读取仓库信息和推送代码
- `Issues: Read and write`
  - 用于 issue 读取、创建和评论
- `Pull requests: Read and write`
  - 用于 PR 读取、创建、评论和 review
- `Metadata: Read`
  - 仓库元数据读取通常是基础能力

如果你只想做最小验证：

- 发布仓库：
  - `Administration: Write`
  - `Contents: Read and write`
- 读 issue / PR：
  - `Issues: Read`
  - `Pull requests: Read`

### fine-grained token 常见限制

根据 GitHub 当前文档，fine-grained token 更安全，但并不是所有场景都和 classic PAT 完全等价。

如果你遇到：

- 仓库创建失败
- 写操作被拒绝
- 访问边界比预期更窄

先检查：

- Resource owner 是否选成了你的个人账号
- Repository access 是否覆盖了目标仓库
- `Administration` / `Contents` / `Issues` / `Pull requests` 权限是否给够

如果仍不稳定，可直接改用 classic PAT。

## 方案二：classic PAT

### 适用场景

适合：

- 你只想快速把当前项目跑通
- 你需要更宽松的兼容性
- fine-grained token 在当前目标场景下不够稳定

### 创建步骤

1. 登录 GitHub
2. 点击右上角头像
3. 进入 `Settings`
4. 左侧进入 `Developer settings`
5. 进入 `Personal access tokens`
6. 进入 `Tokens (classic)`
7. 点击 `Generate new token`
8. 填写：
   - Note
   - Expiration
9. 选择当前项目所需 scope
10. 点击生成
11. 立即复制 token 并保存

### 当前项目建议 scope

如果你要：

- 创建 private 仓库
- 推送 private 仓库
- 执行更完整的个人仓库写操作

建议至少选：

- `repo`

如果你只想：

- 操作 public 仓库
- 创建 public 仓库

可以考虑：

- `public_repo`

但为了避免后面又因为 scope 不足重建 token，当前项目更稳妥的做法仍然是：

- 直接选 `repo`

## 如何填入当前项目

当前项目的 GitHub 登录路径是：

1. 调用：

```text
auth_begin({
  provider: "github",
  method: "manual_token",
  capabilityBundle: "github-basic"
})
```

2. 记下返回的 `sessionId`

3. 再调用：

```text
auth_complete({
  sessionId: "...",
  payload: {
    token: "你的 GitHub PAT"
  }
})
```

4. 验证：

```text
auth_status({ provider: "github" })
auth_validate({ provider: "github" })
```

## 当前项目对 GitHub 凭证的真实边界

当前项目支持：

- 个人账号登录
- 仓库 / 分支 / PR / issue 读操作
- 第一批 issue / PR 写操作
- 当前项目建仓并推送到你自己的 GitHub 个人仓库

当前项目不支持：

- 组织仓库创建与发布
- 官方 `@github` 登录态接管

## 常见错误

### `github_scope_missing`

说明：

- 当前 token 没有当前操作所需的写权限

先检查：

- fine-grained token 的 `Contents` / `Issues` / `Pull requests` / `Administration`
- classic PAT 是否给了 `repo` 或 `public_repo`

### token 无效或过期

先检查：

- 是否复制错 token
- 是否 token 已被删除
- 是否 token 已过期

### owner 不匹配

说明：

- 你要发布到的仓库 owner 不是当前 token 对应的 GitHub 个人账号

当前项目 v1 只支持：

- 当前已登录个人账号名下仓库

### fine-grained token 可以登录，但写操作异常

先检查：

- Repository access 是否覆盖目标仓库
- 是否给了 `Administration: Write`
- 是否给了 `Contents: Read and write`

若仍不稳定：

- 直接切 classic PAT 重新验证

# 公开使用配置指南

## 目标

这份文档面向第一次下载本项目的外部用户，说明如何在本地完成最小配置、接入 `MCP`、完成一次认证并做基础验证。

当前目标是“能下载并配置使用”，不是一键安装器。

## 适用环境

当前默认面向以下环境：

- Windows
- 已安装 `Node.js`
- 已安装 `npm`
- 本地可运行 `Codex`

当前仓库保留了面向 Windows 的凭据存储与浏览器拉起逻辑：

- 正常模式默认使用 Windows Credential Manager
- 浏览器授权默认优先尝试 `Chrome`
- 若自动拉起失败，可以手动复制授权 URL 到浏览器

## 下载后目录结构

你至少会用到以下位置：

- 项目入口：
  - `README.md`
- 项目级 MCP manifest：
  - `mcp/service-auth-gateway/.mcp.json`
- MCP 服务目录：
  - `mcp/service-auth-gateway/`
- 正式操作手册：
  - `references/OPERATION_MANUAL.md`

## 安装与启动

进入 gateway 目录：

```powershell
cd .\mcp\service-auth-gateway
```

启动服务：

```powershell
npm start
```

运行测试：

```powershell
npm test
```

运行 smoke test：

```powershell
npm run smoke
```

## MCP 接入方式

当前支持两种接入方式。

### 方式一：项目级接入

仓库内已经提供：

- `mcp/service-auth-gateway/.mcp.json`

这适合：

- 只想在当前项目内使用
- 不想先改自己的全局 Codex 配置

### 方式二：全局接入

如果你想让 Codex 在多个项目中发现这个 `MCP` 服务，可以在**你自己的** Codex 配置中注册 `service-auth-gateway`。

文档中的全局接入说明是“可选接入方式”，不是仓库默认已经替你完成的状态。

你需要把全局配置中的路径改成你本机实际下载后的项目路径。

## 运行态数据与凭据存储

### 运行态数据目录

默认运行态数据写入：

- `mcp/service-auth-gateway/data/`

如果你想改到别的位置，可设置环境变量：

```powershell
$env:CODEX_AUTH_GATEWAY_DATA_DIR="D:\your\data\dir"
```

它会影响例如：

- `state.json`
- `sessions.json`

### 凭据存储

- Windows 正常模式：
  - token、refresh token、client secret 默认存入 Windows Credential Manager
- 测试模式：
  - 使用环境变量模拟 secret 存储

仓库不会把真实运行态凭据提交进 Git。

## GitHub 最短配置路径

如果你只想先验证 GitHub：

1. 启动 `service-auth-gateway`
2. 准备 GitHub PAT
3. 调用：

```text
auth_begin({
  provider: "github",
  method: "manual_token",
  capabilityBundle: "github-basic"
})
```

4. 再调用：

```text
auth_complete({
  sessionId: "...",
  payload: {
    token: "你的 GitHub PAT"
  }
})
```

5. 最后校验：

```text
auth_status({ provider: "github" })
```

## Google OAuth 最短配置路径

如果你要验证 Google：

1. 准备你自己的 Google OAuth client 信息
2. 启动 `service-auth-gateway`
3. 调用：

```text
auth_begin({
  provider: "google",
  method: "browser_oauth",
  capabilityBundle: "gmail-basic"
})
```

4. 再调用：

```text
auth_complete({
  sessionId: "...",
  payload: {
    clientId: "...",
    clientSecret: "..."
  }
})
```

5. 打开返回的授权 URL
6. 浏览器回调后，再次调用：

```text
auth_complete({
  sessionId: "..."
})
```

7. 最后校验：

```text
auth_status({ provider: "google", capabilityBundle: "gmail-basic" })
```

## 本地 OAuth 辅助脚本说明

仓库包含：

- `mcp/service-auth-gateway/scripts/live-google-oauth.js`

它只是本地联调辅助脚本，不会替你提供现成的 Google OAuth client。

当前使用时应显式传入你自己的 client 文件路径，例如：

```powershell
node .\scripts\live-google-oauth.js --client="D:\path\to\client_secret.json"
```

如果浏览器没有自动打开，可以手动复制输出的授权 URL。

## 基本验证命令

建议至少验证以下入口：

```text
auth_list_providers()
auth_status_overview()
auth_validate({ provider: "github" })
```

若要验证发布链路，再继续使用：

```text
github_publish_prepare({
  projectPath: "你的项目绝对路径",
  repositoryUrl: "https://github.com/<owner>/<repo>"
})
```

## 常见失败点

- `Node.js` 或 `npm` 未安装
- 没有把路径改成自己机器上的项目目录
- 误以为仓库已经替自己完成全局 Codex 配置
- 没有准备自己的 GitHub PAT
- 没有准备自己的 Google OAuth client 信息
- 浏览器自动拉起失败后，没有手动复制授权 URL
- 把运行态 `data/` 文件当成应提交或应共享的配置来源

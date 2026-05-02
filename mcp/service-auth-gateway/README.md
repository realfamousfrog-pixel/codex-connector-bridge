# service-auth-gateway

Local MCP auth gateway prototype for GitHub and Google.

## What It Provides

- Unified local auth tools for `github` and `google`
- Google browser OAuth with local loopback callback capture
- Google manual refresh-token flow
- GitHub manual token validation
- GitHub repository-link publish preview and execute flow
- Visualization-friendly login status summary
- GitHub / Gmail status cards with per-card online refresh
- Local HTML panel for auth status and GitHub publish
- Local state metadata in `data/state.json`
- Secret storage in Windows Credential Manager during normal runs

## Run

```powershell
npm start
```

## Test

```powershell
npm test
```

## Smoke Test

```powershell
npm run smoke
```

## MCP Registration

This project includes a local MCP manifest at:

- [`.mcp.json`](D:/project/CodexWorkSpace/2026-04-29-login-experience/mcp/service-auth-gateway/.mcp.json)

Its current command points to the local server entry:

```json
{
  "mcpServers": {
    "service-auth-gateway": {
      "command": "node",
      "args": ["./src/server.js"],
      "cwd": "."
    }
  }
}
```

This project includes a local manifest for project-scoped registration. In the current user environment, `service-auth-gateway` has also already been registered in `C:\Users\86175\.codex\config.toml`, so Codex can discover it from global MCP config as well. Keep these two facts separate: the repository ships a local manifest, while global registration depends on the user's machine state.

## Google Browser OAuth Flow

1. Call `auth_begin` with:
   - `provider=google`
   - `method=browser_oauth`
   - `capabilityBundle=gmail-basic` or `drive-basic`
2. Call `auth_complete` with:
   - `sessionId`
   - `payload.clientId`
   - `payload.clientSecret`
   - optional `payload.redirectUri`
3. If no `redirectUri` is provided, the gateway starts a local loopback listener on `127.0.0.1` and returns a desktop-style authorization URL using `http://localhost:<port>/`.
4. The gateway adds PKCE (`code_challenge_method=S256`) and requests account selection plus consent by default.
5. For this project, the live local OAuth helper prefers launching `Chrome` directly when available; otherwise, copy the returned URL into a browser manually and complete consent.
6. After the browser redirects back locally, call `auth_complete` again with the same `sessionId`.

## GitHub Publish Flow

1. Call `github_publish_prepare` with:
   - `projectPath`
   - `repositoryUrl`
2. The gateway validates local GitHub auth, checks the repository link, checks local git state, and returns a staged-file preview.
3. If the target personal repository does not exist yet, the preview will require:
   - `visibility`
   - `createRepository=true`
4. Call `github_publish_execute` with:
   - `projectPath`
   - `repositoryUrl`
   - `commitMessage`
   - `confirmStagePreview=true`
   - optional `visibility`
   - optional `createRepository=true`
5. The gateway will create the personal repository when allowed, initialize git if needed, add a clean HTTPS `origin`, commit, and push.

## Local Panel

Use:

```text
ui_open_panel()
```

The gateway starts a local `127.0.0.1` panel, returns a URL with a short-lived local panel token, and attempts to open it in `Chrome`.

Current panel behavior:

- Shows cached GitHub / Gmail status cards first, then automatically runs online validation
- Allows manual refresh for each card
- Allows GitHub logout only
- Supports GitHub publish preview / execute with a separate result area
- Treats Gmail as local `google + gmail-basic` validation, not as the official Gmail connector login state

## Notes

- The loopback listener is in-memory for the current gateway process.
- The repository ships a local `.mcp.json` manifest, but whether it is globally registered depends on the current user's Codex configuration.
- Test mode uses environment variables instead of Windows Credential Manager.
- Login status visualization now includes both structured status output and a local HTML panel.
- GitHub publish v1 only supports personal repositories under the currently authenticated user account.
- GitHub publish v1 does not support organization repositories, force push, or auto-merging non-empty remotes.
- On some Windows hosts, Google token exchange may fall back to `PowerShell Invoke-WebRequest` when Node `fetch` cannot reach `oauth2.googleapis.com` directly.

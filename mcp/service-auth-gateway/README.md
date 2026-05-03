# service-auth-gateway

Local MCP auth gateway prototype for GitHub and Google.

## What It Provides

- Unified local auth tools for `github` and `google`
- Google browser OAuth with local loopback callback capture
- Google manual refresh-token flow
- GitHub manual token validation
- Route resolution between local auth, local publish, and official connectors
- GitHub local read-operation fallback tools
- GitHub local collaboration write fallback tools
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

- [`.mcp.json`](./.mcp.json)

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

This project includes a local manifest for project-scoped registration. Users may also register `service-auth-gateway` in their own global Codex configuration if they want cross-project discovery. Keep these two facts separate: the repository ships a local manifest, while global registration depends on the user's machine state.

## Public Setup

For public-repository use, keep the setup model split into two layers:

- project-scoped MCP discovery:
  - use `mcp/service-auth-gateway/.mcp.json`
- optional global discovery:
  - register `service-auth-gateway` in your own Codex configuration

Runtime data defaults to:

- `mcp/service-auth-gateway/data/`

You can override the runtime data directory with:

```powershell
$env:CODEX_AUTH_GATEWAY_DATA_DIR="D:\your\data\dir"
```

Credential storage behavior:

- normal Windows runs:
  - Windows Credential Manager
- test mode:
  - environment variables

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
3. If the working tree is already clean but the current branch is ahead of remote, the preview returns a push-only recovery result instead of blocking as no changes.
4. If the target personal repository does not exist yet, the preview will require:
   - `visibility`
   - `createRepository=true`
5. Call `github_publish_execute` with:
   - `projectPath`
   - `repositoryUrl`
   - `commitMessage`
   - `confirmStagePreview=true`
   - optional `visibility`
   - optional `createRepository=true`
6. The gateway will create the personal repository when allowed, initialize git if needed, add a clean HTTPS `origin`, and then either commit and push or directly push existing ahead commits.

## Route Resolution

Use:

```text
auth_resolve_route(...)
```

This tool is intended for the business-operation layer:

- login, status, validate, and logout stay on the local gateway
- current-project GitHub publish stays on the local gateway
- GitHub repo / branch / PR / issue collaboration requests should prefer the official `@github` connector when it is reliable in the current environment, otherwise fall back to local GitHub tools
- Gmail / Drive-family business requests should prefer `@gmail` or `@google-drive` after local auth is confirmed

The gateway does not treat local auth as official plugin session takeover. It only returns the route decision and the next action.

## GitHub Local Fallback Tools

The gateway now provides:

- `auth_status_cards`
- `auth_refresh_status_card`
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

This V1 surface is intentionally fixed for the current stabilization stage:

- `auth_resolve_route` is the only business-route entry for the chat layer
- local GitHub fallback only covers:
  - repository / branch / pull request / issue read operations
  - the first collaboration write batch for issue / pull request
  - current-project publish
- this stage does not add labels, merge, approve or request changes, release, Pages, or Actions tools

These tools:

- require `repositoryUrl`
- use the current local GitHub token
- use `confirm=true` for local write execution
- require `repo` or `public_repo` for local write execution
- cover GitHub business gaps when the official plugin cannot be relied on because of missing login or missing tool exposure in the current environment

Stable blocked or validation outcomes in V1 include:

- `github_auth_required`
- `github_scope_missing`
- `repository_not_found`
- `issue_not_found`
- `pull_request_not_found`
- `github_repo_access_denied`
- write-validation failures such as:
  - `issue_create_invalid`
  - `issue_comment_create_invalid`
  - `pull_request_create_invalid`
  - `pull_request_comment_create_invalid`
  - `pull_request_review_create_invalid`

## Local Panel

Use:

```text
ui_open_panel()
```

The gateway starts a local `127.0.0.1` panel, returns a URL with a short-lived local panel token, and attempts to open it in `Chrome`.

Current panel behavior:

- shows cached GitHub / Gmail status cards first, then automatically runs online validation
- allows manual refresh for each card
- allows GitHub logout only
- supports GitHub publish preview / execute with a separate result area
- treats Gmail as local `google + gmail-basic` validation, not as the official Gmail connector login state

## Notes

- The loopback listener is in-memory for the current gateway process.
- The repository ships a local `.mcp.json` manifest, but whether it is globally registered depends on the current user's Codex configuration.
- Test mode uses environment variables instead of Windows Credential Manager.
- Login status visualization now includes both structured status output and a local HTML panel.
- Business-operation routing now prefers official connectors where they can be relied on, and falls back to local GitHub read / collaboration write tools for GitHub V1 gap coverage.
- GitHub publish v1 only supports personal repositories under the currently authenticated user account.
- GitHub publish v1 does not support organization repositories, force push, or auto-merging non-empty remotes.
- On some Windows hosts, Google token exchange may fall back to `PowerShell Invoke-WebRequest` when Node `fetch` cannot reach `oauth2.googleapis.com` directly.

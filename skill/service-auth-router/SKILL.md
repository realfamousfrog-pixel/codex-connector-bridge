---
name: service-auth-router
description: Unified login and authentication routing for local Codex work across GitHub and Google services. Use when Codex needs to log in, inspect login state, publish the current project, switch accounts, log out, or decide whether a task should use an official plugin connector or the local service-auth-gateway MCP path.
---

# Service Auth Router

Use this skill as the single entrypoint for local authentication work.

## Workflow

1. Classify the user request:
- login
- status check
- publish
- switch account
- logout
- task-specific auth gap or recovery after publish/auth failure

2. Resolve the target provider:
- `github`
- `google` for Gmail or Drive-family requests

3. Decide the route:
- If the official plugin is clearly available and appropriate, return `use_official_connector`.
- If the official plugin is unavailable or unsuitable in this Codex environment, use the local `service-auth-gateway` MCP path and return `use_local_auth_gateway`.
- If neither path is viable, return `auth_blocked_with_reason`.

4. Use the local gateway tools when local auth is required:
- `auth_list_providers`
- `auth_status`
- `auth_status_overview`
- `auth_begin`
- `auth_complete`
- `auth_validate`
- `auth_logout`
- `auth_capability_matrix`
- `github_publish_prepare`
- `github_publish_execute`
- `ui_open_panel`

## Routing Rules

- Treat Gmail and Drive login as `google`.
- Treat Google Docs, Sheets, and Slides as `drive-basic` capability needs.
- Treat GitHub repo, PR, issue, and CI access as `github-basic`.
- Treat “push current project to GitHub”, “publish to repository link”, and similar requests as publish flows that should check `github-basic` first and then use `github_publish_prepare` / `github_publish_execute`.
- Do not claim that local auth updates the official plugin login state.
- Do not ask the user to retry official Gmail or Google Drive plugin login if the environment is API-routed and local auth is the intended fallback.

## Output Contract

Return a concise routing summary with:
- target provider
- required capability bundle
- selected route
- current local state
- next required user action

For login visualization or "what is logged in right now" requests, prefer `auth_status_overview` first, then drill into `auth_status` for a specific provider when needed.
For local publish requests, prefer `github_publish_prepare` first, surface any blocking reason verbatim, and only call `github_publish_execute` after the user has confirmed preview, visibility, and commit message requirements.

## References

- Provider matrix: [../../references/provider-matrix.md](../../references/provider-matrix.md)
- MCP gateway: [../../mcp/service-auth-gateway/README.md](../../mcp/service-auth-gateway/README.md)

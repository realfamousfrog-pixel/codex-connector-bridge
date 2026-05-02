# Provider Matrix

## Providers

### GitHub

- Provider: `github`
- Capability bundle: `github-basic`
- Supported methods:
  - `manual_token`
- Route resolver:
  - `auth_resolve_route`
- Current local read tools:
  - `github_repository_get`
  - `github_branch_list`
  - `github_pull_request_list`
  - `github_pull_request_get`
  - `github_issue_list`
  - `github_issue_get`
- Current local collaboration write tools:
  - `github_issue_create`
  - `github_issue_comment_create`
  - `github_pull_request_create`
  - `github_pull_request_comment_create`
  - `github_pull_request_review_create`
- Current local publish tools:
  - `github_publish_prepare`
  - `github_publish_execute`
- Default route:
  - login/status/validate/logout: local gateway
  - publish current project: local gateway
  - repo/PR/issue collaboration operations: official-first, local fallback when the official connector cannot be relied on in the current environment

### Google

- Provider: `google`
- Capability bundles:
  - `gmail-basic`
  - `drive-basic`
- Supported methods:
  - `browser_oauth`
  - `manual_refresh_token`
- Route resolver:
  - `auth_resolve_route`
- Default route:
  - login/status/validate/logout: local gateway
  - Gmail/Drive business operations: official connector path first; local business fallback not started yet

## Route Outcomes

- `use_official_connector`
- `use_local_auth_gateway`
- `auth_blocked_with_reason`

## Current Boundaries

- GitHub local business fallback V1 covers read operations plus the first collaboration write batch, and requires `repositoryUrl`.
- GitHub local collaboration write tools currently require `confirm=true` and a token with `repo` or `public_repo`.
- GitHub local fallback V1 is intentionally frozen at:
  - repository / branch / pull request / issue reads
  - issue / pull request first collaboration write batch
  - current-project publish
- GitHub local fallback V1 does not add labels, merge, approve or request changes, release, Pages, or Actions tools in this stage.
- Stable GitHub blocked outcomes in this stage include:
  - `github_auth_required`
  - `github_scope_missing`
  - `repository_not_found`
  - `issue_not_found`
  - `pull_request_not_found`
  - `github_repo_access_denied`
- GitHub publish v1 only supports personal repositories under the currently authenticated GitHub user.
- GitHub publish v1 can auto-create a missing personal repository, but does not support organization repositories.
- Google currently covers authentication, status, and business-route resolution; it does not duplicate Gmail or Drive business APIs inside the local MCP.

## GitHub Official Plugin Matrix In This Environment

- Repository read:
  - current result: `unknown`
  - reason: official GitHub connector tool surface was not exposed in the current thread for stable unauthenticated verification
- Branch list:
  - current result: `unknown`
  - reason: same as above
- PR list/detail:
  - current result: `unknown`
  - reason: same as above
- Issue list/detail:
  - current result: `unknown`
  - reason: same as above
- Issue / PR write operations:
  - current result: `unknown`
  - reason: same as above

# Provider Matrix

## Providers

### GitHub

- Provider: `github`
- Capability bundle: `github-basic`
- Supported methods:
  - `manual_token`
- Current local publish tools:
  - `github_publish_prepare`
  - `github_publish_execute`
- Default route:
  - local gateway

### Google

- Provider: `google`
- Capability bundles:
  - `gmail-basic`
  - `drive-basic`
- Supported methods:
  - `browser_oauth`
  - `manual_refresh_token`
- Default route:
  - local gateway

## Route Outcomes

- `use_official_connector`
- `use_local_auth_gateway`
- `auth_blocked_with_reason`

## Current Boundaries

- GitHub publish v1 only supports personal repositories under the currently authenticated GitHub user.
- GitHub publish v1 can auto-create a missing personal repository, but does not support organization repositories.
- Google currently covers authentication and status only, not Gmail or Drive business operations.

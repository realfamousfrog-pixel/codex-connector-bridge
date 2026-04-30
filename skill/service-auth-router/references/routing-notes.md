# Routing Notes

- Prefer the official plugin only when the user explicitly wants that path and the environment can support it.
- Prefer the local gateway when the official plugin depends on cloud connector login that is not available in the current API-routed Codex setup.
- For Google requests, choose `gmail-basic` for Gmail and `drive-basic` for Drive, Docs, Sheets, and Slides.
- For login status visualization, start with `auth_status_overview`.
- For GitHub publish requests that provide a repository link or ask to push the current project, prefer the local gateway publish tools instead of asking the user to run raw `git push`.
- Treat publish failures caused by auth loss, missing scope, remote conflicts, or unsupported owner types as `auth_blocked_with_reason` style recovery points and return the next user action explicitly.

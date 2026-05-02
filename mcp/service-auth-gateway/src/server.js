import { AuthGateway } from "./gateway.js";
import { closeAllLoopbackServers } from "./loopback-manager.js";
import { logEvent } from "./logger.js";
import { closePanelServer } from "./panel-server.js";

const gateway = new AuthGateway();
await gateway.init();

const tools = [
  {
    name: "auth_list_providers",
    description: "List supported providers and current local auth state.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "auth_status",
    description: "Read local auth status for a provider.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["github", "google"] },
        capabilityBundle: {
          type: "string",
          enum: ["github-basic", "gmail-basic", "drive-basic"],
        },
      },
      required: ["provider"],
      additionalProperties: false,
    },
  },
  {
    name: "auth_begin",
    description: "Start an auth flow for a provider.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["github", "google"] },
        method: {
          type: "string",
          enum: ["browser_oauth", "manual_token", "manual_refresh_token"],
        },
        capabilityBundle: {
          type: "string",
          enum: ["github-basic", "gmail-basic", "drive-basic"],
        },
        accountLabel: { type: "string" },
      },
      required: ["provider", "method"],
      additionalProperties: false,
    },
  },
  {
    name: "auth_complete",
    description: "Complete an auth flow session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        payload: { type: "object" },
      },
      required: ["sessionId"],
      additionalProperties: true,
    },
  },
  {
    name: "auth_validate",
    description: "Validate or refresh local auth state for a provider.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["github", "google"] },
      },
      required: ["provider"],
      additionalProperties: false,
    },
  },
  {
    name: "auth_logout",
    description: "Delete local credentials for a provider.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["github", "google"] },
      },
      required: ["provider"],
      additionalProperties: false,
    },
  },
  {
    name: "auth_capability_matrix",
    description: "Return the supported provider capability matrix.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "auth_status_overview",
    description: "Return a visualization-friendly auth status summary for all providers.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "auth_resolve_route",
    description:
      "Resolve whether a request should use local auth tools, local publish flow, or the official connector after auth is ready.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["github", "google"] },
        intent: {
          type: "string",
          enum: ["login", "status", "validate", "logout", "publish", "business_operation"],
        },
        capabilityBundle: {
          type: "string",
          enum: ["github-basic", "gmail-basic", "drive-basic"],
        },
        operationName: { type: "string" },
        repositoryUrl: { type: "string" },
      },
      required: ["provider", "intent"],
      additionalProperties: false,
    },
  },
  {
    name: "github_repository_get",
    description: "Read GitHub repository details through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
      },
      required: ["repositoryUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "github_branch_list",
    description: "List repository branches through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["repositoryUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "github_pull_request_list",
    description: "List pull requests through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["repositoryUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "github_pull_request_get",
    description: "Read a pull request through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        pullNumber: { type: "integer", minimum: 1 },
      },
      required: ["repositoryUrl", "pullNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "github_issue_list",
    description: "List issues through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["repositoryUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "github_issue_get",
    description: "Read an issue through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        issueNumber: { type: "integer", minimum: 1 },
      },
      required: ["repositoryUrl", "issueNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "github_issue_create",
    description: "Create an issue through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["repositoryUrl", "title", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "github_issue_comment_create",
    description: "Create an issue comment through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        issueNumber: { type: "integer", minimum: 1 },
        body: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["repositoryUrl", "issueNumber", "body", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "github_pull_request_create",
    description: "Create a pull request through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["repositoryUrl", "title", "head", "base", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "github_pull_request_comment_create",
    description: "Create a pull request comment through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        pullNumber: { type: "integer", minimum: 1 },
        body: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["repositoryUrl", "pullNumber", "body", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "github_pull_request_review_create",
    description: "Create a comment-only pull request review through the local auth gateway.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string" },
        pullNumber: { type: "integer", minimum: 1 },
        body: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["repositoryUrl", "pullNumber", "body", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "github_publish_prepare",
    description: "Prepare a GitHub publish operation for the current local project.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        repositoryUrl: { type: "string" },
      },
      required: ["projectPath", "repositoryUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "github_publish_execute",
    description: "Create or bind a GitHub repository, commit the current project, and push it.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        repositoryUrl: { type: "string" },
        commitMessage: { type: "string" },
        confirmStagePreview: { type: "boolean" },
        visibility: { type: "string", enum: ["public", "private"] },
        createRepository: { type: "boolean" },
      },
      required: [
        "projectPath",
        "repositoryUrl",
        "commitMessage",
        "confirmStagePreview",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "ui_open_panel",
    description: "Open a local HTML panel for auth status and GitHub publish actions.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleToolCall(name, args) {
  if (typeof gateway[name] !== "function") {
    throw new Error(`Unknown tool: ${name}`);
  }
  return gateway[name](args);
}

process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) {
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      continue;
    }
    try {
      if (message.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "service-auth-gateway",
              version: "0.1.0",
            },
            capabilities: {
              tools: {},
            },
          },
        });
        continue;
      }
      if (message.method === "tools/list") {
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools,
          },
        });
        continue;
      }
      if (message.method === "tools/call") {
        const result = await handleToolCall(
          message.params?.name,
          message.params?.arguments ?? {},
        );
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result),
              },
            ],
          },
        });
        continue;
      }
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Method not found" },
      });
    } catch (error) {
      logEvent("mcp_error", { message: error.message });
      send({
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: { code: -32000, message: error.message },
      });
    }
  }
});

process.on("SIGINT", () => {
  closePanelServer();
  closeAllLoopbackServers();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closePanelServer();
  closeAllLoopbackServers();
  process.exit(0);
});

import { jsonRequest } from "./http-client.js";

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "codex-service-auth-gateway",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function parseGithubRepositoryUrl(repositoryUrl) {
  let parsed;
  try {
    parsed = new URL(repositoryUrl);
  } catch {
    throw new Error("repositoryUrl must be a valid GitHub HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("repositoryUrl must use https.");
  }
  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error("repositoryUrl must point to github.com.");
  }
  const segments = parsed.pathname
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
  if (segments.length !== 2) {
    throw new Error("repositoryUrl must match https://github.com/<owner>/<repo>.");
  }
  const [owner, repo] = segments;
  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    apiPath: `/repos/${owner}/${repo}`,
  };
}

function readGithubErrorMessage(body, fallback) {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  if (body && typeof body.message === "string" && body.message.trim()) {
    return body.message.trim();
  }
  return fallback;
}

export class GithubApiError extends Error {
  constructor({ message, status, body, code }) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
    this.body = body;
    this.code = code ?? null;
  }
}

function githubApiError(response, fallbackMessage, code) {
  return new GithubApiError({
    status: response.status,
    body: response.body,
    code,
    message: readGithubErrorMessage(response.body, fallbackMessage),
  });
}

export class GithubRepoClient {
  constructor({ token }) {
    this.token = token;
  }

  async getCurrentUser() {
    const response = await jsonRequest("https://api.github.com/user", {
      headers: githubHeaders(this.token),
    });
    if (response.status === 401) {
      throw new Error("GitHub token is invalid or expired.");
    }
    if (!response.ok) {
      throw new Error(`GitHub user lookup failed with status ${response.status}.`);
    }
    return response.body;
  }

  async getRepository(owner, repo) {
    const response = await jsonRequest(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: githubHeaders(this.token),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`GitHub repository lookup failed with status ${response.status}.`);
    }
    return response.body;
  }

  async listBranches(owner, repo, limit = 20) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=${limit}`,
      {
        headers: githubHeaders(this.token),
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (response.status === 403) {
      throw new Error("GitHub token does not allow branch listing for this repository.");
    }
    if (!response.ok) {
      throw new Error(`GitHub branch listing failed with status ${response.status}.`);
    }
    return response.body;
  }

  async listPullRequests(owner, repo, state = "open", limit = 20) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=${encodeURIComponent(state)}&per_page=${limit}`,
      {
        headers: githubHeaders(this.token),
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (response.status === 403) {
      throw new Error("GitHub token does not allow pull request listing for this repository.");
    }
    if (!response.ok) {
      throw new Error(`GitHub pull request listing failed with status ${response.status}.`);
    }
    return response.body;
  }

  async getPullRequest(owner, repo, pullNumber) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        headers: githubHeaders(this.token),
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (response.status === 403) {
      throw new Error("GitHub token does not allow pull request access for this repository.");
    }
    if (!response.ok) {
      throw new Error(`GitHub pull request lookup failed with status ${response.status}.`);
    }
    return response.body;
  }

  async listIssues(owner, repo, state = "open", limit = 20) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=${encodeURIComponent(state)}&per_page=${limit}`,
      {
        headers: githubHeaders(this.token),
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (response.status === 403) {
      throw new Error("GitHub token does not allow issue listing for this repository.");
    }
    if (!response.ok) {
      throw new Error(`GitHub issue listing failed with status ${response.status}.`);
    }
    return response.body;
  }

  async getIssue(owner, repo, issueNumber) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: githubHeaders(this.token),
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (response.status === 403) {
      throw new Error("GitHub token does not allow issue access for this repository.");
    }
    if (!response.ok) {
      throw new Error(`GitHub issue lookup failed with status ${response.status}.`);
    }
    return response.body;
  }

  async createIssue(owner, repo, { title, body }) {
    const response = await jsonRequest(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        ...githubHeaders(this.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body: body ?? "",
      }),
    });
    if (response.status === 404) {
      throw githubApiError(response, "GitHub repository was not found.", "repository_not_found");
    }
    if (response.status === 403) {
      throw githubApiError(
        response,
        "GitHub token does not allow issue creation for this repository.",
        "issue_create_forbidden",
      );
    }
    if (response.status === 422) {
      throw githubApiError(
        response,
        "GitHub issue creation failed validation.",
        "issue_create_invalid",
      );
    }
    if (!response.ok) {
      throw githubApiError(
        response,
        `GitHub issue creation failed with status ${response.status}.`,
        "issue_create_failed",
      );
    }
    return response.body;
  }

  async createIssueComment(owner, repo, issueNumber, { body }) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          ...githubHeaders(this.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      },
    );
    if (response.status === 404) {
      throw githubApiError(response, "GitHub issue was not found.", "issue_not_found");
    }
    if (response.status === 403) {
      throw githubApiError(
        response,
        "GitHub token does not allow issue comment creation for this repository.",
        "issue_comment_create_forbidden",
      );
    }
    if (response.status === 422) {
      throw githubApiError(
        response,
        "GitHub issue comment creation failed validation.",
        "issue_comment_create_invalid",
      );
    }
    if (!response.ok) {
      throw githubApiError(
        response,
        `GitHub issue comment creation failed with status ${response.status}.`,
        "issue_comment_create_failed",
      );
    }
    return response.body;
  }

  async createPullRequest(owner, repo, { title, body, head, base }) {
    const response = await jsonRequest(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        ...githubHeaders(this.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body: body ?? "",
        head,
        base,
      }),
    });
    if (response.status === 404) {
      throw githubApiError(response, "GitHub repository was not found.", "repository_not_found");
    }
    if (response.status === 403) {
      throw githubApiError(
        response,
        "GitHub token does not allow pull request creation for this repository.",
        "pull_request_create_forbidden",
      );
    }
    if (response.status === 422) {
      throw githubApiError(
        response,
        "GitHub pull request creation failed validation.",
        "pull_request_create_invalid",
      );
    }
    if (!response.ok) {
      throw githubApiError(
        response,
        `GitHub pull request creation failed with status ${response.status}.`,
        "pull_request_create_failed",
      );
    }
    return response.body;
  }

  async createPullRequestComment(owner, repo, pullNumber, { body }) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
      {
        method: "POST",
        headers: {
          ...githubHeaders(this.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      },
    );
    if (response.status === 404) {
      throw githubApiError(response, "GitHub pull request was not found.", "pull_request_not_found");
    }
    if (response.status === 403) {
      throw githubApiError(
        response,
        "GitHub token does not allow pull request comment creation for this repository.",
        "pull_request_comment_create_forbidden",
      );
    }
    if (response.status === 422) {
      throw githubApiError(
        response,
        "GitHub pull request comment creation failed validation.",
        "pull_request_comment_create_invalid",
      );
    }
    if (!response.ok) {
      throw githubApiError(
        response,
        `GitHub pull request comment creation failed with status ${response.status}.`,
        "pull_request_comment_create_failed",
      );
    }
    return response.body;
  }

  async createPullRequestReview(owner, repo, pullNumber, { body }) {
    const response = await jsonRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
      {
        method: "POST",
        headers: {
          ...githubHeaders(this.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body,
          event: "COMMENT",
        }),
      },
    );
    if (response.status === 404) {
      throw githubApiError(response, "GitHub pull request was not found.", "pull_request_not_found");
    }
    if (response.status === 403) {
      throw githubApiError(
        response,
        "GitHub token does not allow pull request review creation for this repository.",
        "pull_request_review_create_forbidden",
      );
    }
    if (response.status === 422) {
      throw githubApiError(
        response,
        "GitHub pull request review creation failed validation.",
        "pull_request_review_create_invalid",
      );
    }
    if (!response.ok) {
      throw githubApiError(
        response,
        `GitHub pull request review creation failed with status ${response.status}.`,
        "pull_request_review_create_failed",
      );
    }
    return response.body;
  }

  async createRepository(repo, visibility) {
    const response = await jsonRequest("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        ...githubHeaders(this.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repo,
        private: visibility !== "public",
        auto_init: false,
      }),
    });
    if (response.status === 422) {
      throw new Error("GitHub repository already exists or the repository name is not allowed.");
    }
    if (response.status === 403) {
      throw new Error("GitHub token does not allow repository creation.");
    }
    if (!response.ok) {
      throw new Error(`GitHub repository creation failed with status ${response.status}.`);
    }
    return response.body;
  }
}

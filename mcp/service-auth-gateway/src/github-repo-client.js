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

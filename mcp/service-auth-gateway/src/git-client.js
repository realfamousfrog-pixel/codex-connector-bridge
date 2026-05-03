import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function formatGitError(error, fallback) {
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
  const message = stderr || stdout || error?.message || fallback;
  return message;
}

function normalizePath(input) {
  return path.resolve(input).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function normalizeRemoteUrl(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }
  try {
    const parsed = new URL(remoteUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return remoteUrl.trim();
    }
    parsed.hash = "";
    parsed.search = "";
    parsed.username = "";
    parsed.password = "";
    parsed.pathname = parsed.pathname.replace(/\.git$/i, "").replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return String(remoteUrl).trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  }
}

function parseStatusLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export class GitClient {
  async runGit(args, { cwd, allowFailure = false } = {}) {
    try {
      const result = await execFileAsync("git", args, {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
      });
      return {
        ok: true,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      };
    } catch (error) {
      if (allowFailure) {
        return {
          ok: false,
          stdout: typeof error?.stdout === "string" ? error.stdout.trim() : "",
          stderr: typeof error?.stderr === "string" ? error.stderr.trim() : "",
          error,
        };
      }
      throw new Error(formatGitError(error, "Git command failed."));
    }
  }

  async ensureProjectPath(projectPath) {
    if (!path.isAbsolute(projectPath)) {
      throw new Error("projectPath must be an absolute directory path.");
    }
    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error("projectPath must point to an existing directory.");
    }
  }

  async getIdentity(projectPath) {
    const name = await this.runGit(["config", "user.name"], {
      cwd: projectPath,
      allowFailure: true,
    });
    const email = await this.runGit(["config", "user.email"], {
      cwd: projectPath,
      allowFailure: true,
    });
    return {
      userName: name.ok ? name.stdout : "",
      userEmail: email.ok ? email.stdout : "",
    };
  }

  async inspectProject(projectPath) {
    await this.ensureProjectPath(projectPath);
    const topLevel = await this.runGit(["rev-parse", "--show-toplevel"], {
      cwd: projectPath,
      allowFailure: true,
    });
    const identity = await this.getIdentity(projectPath);
    if (!topLevel.ok) {
      return {
        projectPath,
        gitAvailable: true,
        isGitRepository: false,
        repoRoot: null,
        boundaryConflict: false,
        hasCommits: false,
        currentBranch: null,
        hasUpstream: false,
        upstreamRef: null,
        aheadCount: 0,
        behindCount: 0,
        hasOrigin: false,
        originUrl: null,
        normalizedOriginUrl: null,
        remoteStatus: "non_repository",
        identity,
      };
    }

    const repoRoot = topLevel.stdout;
    const boundaryConflict = normalizePath(repoRoot) !== normalizePath(projectPath);
    const currentBranch = await this.runGit(["branch", "--show-current"], {
      cwd: projectPath,
      allowFailure: true,
    });
    const head = await this.runGit(["rev-parse", "--verify", "HEAD"], {
      cwd: projectPath,
      allowFailure: true,
    });
    const upstream = await this.runGit(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      {
        cwd: projectPath,
        allowFailure: true,
      },
    );
    const origin = await this.runGit(["remote", "get-url", "origin"], {
      cwd: projectPath,
      allowFailure: true,
    });
    const hasUpstream = upstream.ok && Boolean(upstream.stdout);
    let aheadCount = 0;
    let behindCount = 0;
    if (hasUpstream) {
      const aheadBehind = await this.runGit(
        ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        {
          cwd: projectPath,
          allowFailure: true,
        },
      );
      if (aheadBehind.ok) {
        const [behindText = "0", aheadText = "0"] = aheadBehind.stdout.split(/\s+/);
        behindCount = Number.parseInt(behindText, 10) || 0;
        aheadCount = Number.parseInt(aheadText, 10) || 0;
      }
    }

    return {
      projectPath,
      gitAvailable: true,
      isGitRepository: true,
      repoRoot,
      boundaryConflict,
      hasCommits: head.ok,
      currentBranch: currentBranch.ok && currentBranch.stdout ? currentBranch.stdout : null,
      hasUpstream,
      upstreamRef: hasUpstream ? upstream.stdout : null,
      aheadCount,
      behindCount,
      hasOrigin: origin.ok && Boolean(origin.stdout),
      originUrl: origin.ok ? origin.stdout : null,
      normalizedOriginUrl: origin.ok ? normalizeRemoteUrl(origin.stdout) : null,
      remoteStatus: origin.ok && origin.stdout ? "origin_present" : "no_origin",
      identity,
    };
  }

  async getStatusPreview(projectPath, projectState = null) {
    const state = projectState ?? (await this.inspectProject(projectPath));
    if (state.boundaryConflict) {
      return {
        lines: [],
        count: 0,
      };
    }
    if (state.isGitRepository) {
      const status = await this.runGit(
        ["status", "--short", "--untracked-files=all"],
        { cwd: projectPath },
      );
      const lines = parseStatusLines(status.stdout);
      return {
        lines,
        count: lines.length,
      };
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-auth-preview-"));
    try {
      await this.runGit(["init", "--quiet", tempRoot], { cwd: projectPath });
      const gitDir = path.join(tempRoot, ".git");
      const status = await this.runGit(
        [
          "--git-dir",
          gitDir,
          "--work-tree",
          projectPath,
          "status",
          "--short",
          "--untracked-files=all",
        ],
        { cwd: projectPath },
      );
      const lines = parseStatusLines(status.stdout);
      return {
        lines,
        count: lines.length,
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  async initRepository(projectPath) {
    await this.runGit(["init", "--quiet"], { cwd: projectPath });
  }

  async pointHeadToMain(projectPath) {
    await this.runGit(["symbolic-ref", "HEAD", "refs/heads/main"], {
      cwd: projectPath,
    });
  }

  async addOrigin(projectPath, remoteUrl) {
    await this.runGit(["remote", "add", "origin", remoteUrl], { cwd: projectPath });
  }

  async stageAll(projectPath) {
    await this.runGit(["add", "--all"], { cwd: projectPath });
  }

  async getStagedFiles(projectPath) {
    const result = await this.runGit(
      ["diff", "--cached", "--name-only", "--diff-filter=ACMRDTUXB"],
      { cwd: projectPath },
    );
    return parseStatusLines(result.stdout);
  }

  async commit(projectPath, message, identity = {}) {
    const userName = identity.userName || "Codex Auth Gateway";
    const userEmail = identity.userEmail || "codex-auth-gateway@local.invalid";
    const args = [
      "-c",
      `user.name=${userName}`,
      "-c",
      `user.email=${userEmail}`,
    ];
    args.push("commit", "-m", message, "--no-gpg-sign");
    await this.runGit(args, { cwd: projectPath });
  }

  async push(projectPath, branch, token) {
    const basicAuth = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
    await this.runGit(
      [
        "-c",
        `http.extraHeader=AUTHORIZATION: Basic ${basicAuth}`,
        "push",
        "-u",
        "origin",
        branch,
      ],
      { cwd: projectPath },
    );
  }
}

export function normalizeGitRemoteUrl(remoteUrl) {
  return normalizeRemoteUrl(remoteUrl);
}

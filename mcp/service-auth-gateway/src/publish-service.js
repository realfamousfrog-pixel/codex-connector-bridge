import { getSecret } from "./credential-store.js";
import { GitClient, normalizeGitRemoteUrl } from "./git-client.js";
import { GithubRepoClient, parseGithubRepositoryUrl } from "./github-repo-client.js";

function summarizeFiles(lines) {
  return {
    count: lines.length,
    files: lines.map((line) => {
      const status = line.slice(0, 2).trim() || "??";
      const file = line.slice(3).trim();
      return { status, path: file };
    }),
  };
}

function summarizePreview(lines, previewKind) {
  return {
    ...summarizeFiles(lines),
    previewKind,
  };
}

function buildBlockedResult({ reason, message, ...rest }) {
  return {
    ok: false,
    status: "blocked",
    reason,
    message,
    ...rest,
  };
}

function buildReadyResult(payload) {
  return {
    ok: true,
    status: "ready",
    ...payload,
  };
}

function buildRepositoryState(repoRef, repository, ownerType = "user") {
  return {
    ...repoRef,
    exists: Boolean(repository),
    canCreate: !repository,
    ownerMatchesAuthenticatedUser: true,
    ownerType,
    isEmpty: repository ? repository.size === 0 : null,
  };
}

export class PublishService {
  constructor({ gitClient, validateGithubAuth }) {
    this.gitClient = gitClient ?? new GitClient();
    this.validateGithubAuth = validateGithubAuth;
  }

  async prepare({ projectPath, repositoryUrl }) {
    if (!projectPath) {
      throw new Error("projectPath is required.");
    }
    if (!repositoryUrl) {
      throw new Error("repositoryUrl is required.");
    }

    const auth = await this.validateGithubAuth();
    if (auth.state !== "authenticated") {
      return buildBlockedResult({
        reason: "github_auth_required",
        message: "GitHub authentication is required before publish.",
        auth,
      });
    }

    const secret = await getSecret("github");
    if (!secret?.token) {
      return buildBlockedResult({
        reason: "github_auth_required",
        message: "GitHub token is not available locally.",
        auth,
      });
    }

    const repoRef = parseGithubRepositoryUrl(repositoryUrl);
    const repoClient = new GithubRepoClient({ token: secret.token });
    const currentUser = await repoClient.getCurrentUser();

    if (repoRef.owner.toLowerCase() !== String(currentUser.login).toLowerCase()) {
      return buildBlockedResult({
        reason: "owner_not_supported",
        message: "Only repositories under the currently authenticated personal GitHub account are supported in v1.",
        auth,
        repository: {
          ...repoRef,
          exists: false,
          canCreate: false,
          ownerMatchesAuthenticatedUser: false,
          ownerType: "unsupported",
        },
      });
    }

    const projectState = await this.gitClient.inspectProject(projectPath);
    if (projectState.boundaryConflict) {
      return buildBlockedResult({
        reason: "project_path_not_repo_root",
        message: "projectPath must point at the git repository root when the project is already a git repository.",
        auth,
        repository: buildRepositoryState(repoRef, null),
        project: projectState,
      });
    }

    const repository = await repoClient.getRepository(repoRef.owner, repoRef.repo);
    const normalizedTargetRemote = normalizeGitRemoteUrl(repoRef.cloneUrl);
    const remoteMatches =
      projectState.normalizedOriginUrl &&
      projectState.normalizedOriginUrl === normalizedTargetRemote;

    if (projectState.hasOrigin && !remoteMatches) {
      return buildBlockedResult({
        reason: "origin_conflict",
        message: "The current project already has an origin remote that does not match the target repository.",
        auth,
        repository: {
          ...buildRepositoryState(repoRef, repository),
          canCreate: false,
        },
        project: {
          ...projectState,
          remoteStatus: "origin_conflict",
          targetOriginUrl: repoRef.cloneUrl,
        },
      });
    }

    if (repository && repository.owner?.type && repository.owner.type !== "User") {
      return buildBlockedResult({
        reason: "organization_not_supported",
        message: "Organization repositories are not supported in v1.",
        auth,
        repository: buildRepositoryState(repoRef, repository, repository.owner.type.toLowerCase()),
        project: projectState,
      });
    }

    if (repository && repository.size > 0 && !remoteMatches) {
      return buildBlockedResult({
        reason: "remote_not_empty",
        message: "The target GitHub repository already contains content and this project is not already bound to the same origin.",
        auth,
        repository: {
          ...buildRepositoryState(repoRef, repository),
          canCreate: false,
        },
        project: {
          ...projectState,
          remoteStatus: "remote_not_empty",
          targetOriginUrl: repoRef.cloneUrl,
        },
      });
    }

    const preview = await this.gitClient.getStatusPreview(projectPath, projectState);
    const normalizedProjectState = {
      ...projectState,
      remoteStatus: remoteMatches
        ? "origin_match"
        : projectState.hasOrigin
          ? projectState.remoteStatus
          : projectState.isGitRepository
            ? "no_origin"
            : "non_repository",
      targetOriginUrl: repoRef.cloneUrl,
    };
    if (projectState.hasUpstream && projectState.behindCount > 0) {
      return buildBlockedResult({
        reason: "branch_sync_required",
        message:
          "The current branch is behind or diverged from its upstream. Publish v1 does not support pull, merge, or rebase recovery.",
        auth,
        repository: buildRepositoryState(repoRef, repository),
        project: normalizedProjectState,
        preview: summarizePreview(preview.lines, "working_tree_changes"),
      });
    }
    const canPushOnly =
      preview.count === 0 &&
      projectState.hasCommits &&
      Boolean(projectState.currentBranch) &&
      (
        (projectState.hasUpstream && projectState.aheadCount > 0) ||
        !projectState.hasUpstream
      );
    if (canPushOnly) {
      return buildReadyResult({
        auth,
        repository: buildRepositoryState(repoRef, repository),
        project: normalizedProjectState,
        publishMode: "push_only",
        aheadCount: projectState.aheadCount,
        previewKind: "ahead_commits",
        preview: summarizePreview([], "ahead_commits"),
        requiredInputs: {
          commitMessage: true,
          confirmStagePreview: true,
          visibility: repository ? false : true,
          createRepository: repository ? false : true,
        },
        nextAction: "confirm_publish_execute",
        message: "GitHub publish recovery is ready. There are existing local commits that can be pushed without creating a new commit.",
      });
    }
    if (preview.count === 0) {
      return buildBlockedResult({
        reason: "no_changes",
        message: "There are no local changes to commit and push.",
        auth,
        repository: buildRepositoryState(repoRef, repository),
        project: normalizedProjectState,
        preview: summarizePreview(preview.lines, "working_tree_changes"),
      });
    }

    return buildReadyResult({
      auth,
      repository: buildRepositoryState(repoRef, repository),
      project: normalizedProjectState,
      publishMode: "commit_and_push",
      aheadCount: projectState.aheadCount,
      previewKind: "working_tree_changes",
      preview: summarizePreview(preview.lines, "working_tree_changes"),
      requiredInputs: {
        commitMessage: true,
        confirmStagePreview: true,
        visibility: repository ? false : true,
        createRepository: repository ? false : true,
      },
      nextAction: "confirm_publish_execute",
      message: repository
        ? "GitHub publish preview is ready."
        : "GitHub publish preview is ready. The target repository will need to be created during execute.",
    });
  }

  async execute({
    projectPath,
      repositoryUrl,
      commitMessage,
      confirmStagePreview,
    visibility,
    createRepository,
  }) {
    if (!commitMessage?.trim()) {
      throw new Error("commitMessage is required.");
    }
    if (confirmStagePreview !== true) {
      throw new Error("confirmStagePreview must be true before publish can execute.");
    }

    const prepared = await this.prepare({ projectPath, repositoryUrl });
    if (!prepared.ok) {
      return prepared;
    }

    if (prepared.requiredInputs.visibility) {
      if (!["public", "private"].includes(visibility)) {
        throw new Error("visibility must be public or private when the target repository does not yet exist.");
      }
      if (createRepository !== true) {
        throw new Error("createRepository must be true when the target repository does not yet exist.");
      }
    }

    const secret = await getSecret("github");
    const repoClient = new GithubRepoClient({ token: secret.token });
    let repository = await repoClient.getRepository(prepared.repository.owner, prepared.repository.repo);
    if (!repository) {
      repository = await repoClient.createRepository(prepared.repository.repo, visibility);
    }

    const projectState = await this.gitClient.inspectProject(projectPath);
    if (!projectState.isGitRepository) {
      await this.gitClient.initRepository(projectPath);
    }

    const afterInitState = await this.gitClient.inspectProject(projectPath);
    if (!afterInitState.hasCommits && !afterInitState.currentBranch) {
      await this.gitClient.pointHeadToMain(projectPath);
    }

    const remoteState = await this.gitClient.inspectProject(projectPath);
    const targetRemote = prepared.repository.cloneUrl;
    if (!remoteState.hasOrigin) {
      await this.gitClient.addOrigin(projectPath, targetRemote);
    }

    const publishMode = prepared.publishMode ?? "commit_and_push";
    if (publishMode === "push_only") {
      const finalState = await this.gitClient.inspectProject(projectPath);
      const branch = finalState.currentBranch;
      if (!branch) {
        return buildBlockedResult({
          reason: "branch_not_publishable",
          message: "The current git branch could not be determined for push-only publish recovery.",
          auth: prepared.auth,
          repository: prepared.repository,
          project: prepared.project,
          preview: prepared.preview,
        });
      }
      if (finalState.hasUpstream && finalState.behindCount > 0) {
        return buildBlockedResult({
          reason: "branch_sync_required",
          message:
            "The current branch is behind or diverged from its upstream. Publish v1 does not support pull, merge, or rebase recovery.",
          auth: prepared.auth,
          repository: prepared.repository,
          project: prepared.project,
          preview: prepared.preview,
        });
      }
      const reusedAheadCount = finalState.hasUpstream ? finalState.aheadCount : 0;
      await this.gitClient.push(projectPath, branch, secret.token);
      return {
        ok: true,
        status: "completed",
        auth: prepared.auth,
        repository: {
          ...prepared.repository,
          exists: true,
          canCreate: false,
          cloneUrl: targetRemote,
          htmlUrl: repository.html_url ?? prepared.repository.normalizedUrl,
        },
        project: {
          ...prepared.project,
          isGitRepository: true,
          hasOrigin: true,
          currentBranch: branch,
          remoteStatus: "origin_match",
          hasUpstream: true,
        },
        publishMode: "push_only",
        previewKind: "ahead_commits",
        commit: {
          message: commitMessage.trim(),
          created: false,
          reusedAheadCount,
          branch,
        },
        nextAction: "ready",
        message: "Existing local commits have been pushed to GitHub.",
      };
    }

    await this.gitClient.stageAll(projectPath);
    const stagedFiles = await this.gitClient.getStagedFiles(projectPath);
    if (stagedFiles.length === 0) {
      return buildBlockedResult({
        reason: "no_changes",
        message: "There are no staged changes to commit after refresh.",
        auth: prepared.auth,
        repository: prepared.repository,
        project: prepared.project,
        preview: summarizeFiles([]),
      });
    }

    const finalState = await this.gitClient.inspectProject(projectPath);
    await this.gitClient.commit(projectPath, commitMessage.trim(), finalState.identity);
    const branch = finalState.currentBranch || "main";
    await this.gitClient.push(projectPath, branch, secret.token);

    return {
      ok: true,
      status: "completed",
      auth: prepared.auth,
      repository: {
        ...prepared.repository,
        exists: true,
        canCreate: false,
        cloneUrl: targetRemote,
        htmlUrl: repository.html_url ?? prepared.repository.normalizedUrl,
      },
      project: {
        ...prepared.project,
        isGitRepository: true,
        hasOrigin: true,
        currentBranch: branch,
        remoteStatus: "origin_match",
      },
      commit: {
        message: commitMessage.trim(),
        created: true,
        reusedAheadCount: 0,
        stagedCount: stagedFiles.length,
        branch,
      },
      publishMode: "commit_and_push",
      previewKind: "working_tree_changes",
      nextAction: "ready",
      message: "Project has been committed and pushed to GitHub.",
    };
  }
}

import crypto from "node:crypto";
import http from "node:http";
import { openUrlInChrome } from "./browser-launcher.js";
import { logEvent } from "./logger.js";

let activePanel = null;

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function html(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function unauthorized(res) {
  json(res, 401, {
    ok: false,
    status: "blocked",
    reason: "panel_auth_required",
    message: "A valid local panel token is required.",
  });
}

function pageTemplate(panelToken) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>统一登录面板</title>
  <style>
    :root {
      --bg: linear-gradient(135deg, #f5efe1 0%, #e6f0ea 100%);
      --panel: rgba(255,255,255,0.88);
      --text: #17322c;
      --muted: #526861;
      --line: rgba(23,50,44,0.14);
      --accent: #1d6f5f;
      --accent-2: #d36f3d;
      --danger: #b3403b;
      --ok: #256f3f;
      --shadow: 0 20px 60px rgba(23, 50, 44, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .shell {
      width: min(1120px, calc(100vw - 32px));
      margin: 32px auto;
      display: grid;
      gap: 20px;
    }
    .hero, .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .hero {
      padding: 28px;
      display: grid;
      gap: 10px;
    }
    .hero h1 { margin: 0; font-size: 30px; }
    .hero p { margin: 0; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .card { padding: 22px; }
    .card h2 { margin: 0 0 16px; font-size: 20px; }
    .status-list, .preview-list {
      display: grid;
      gap: 12px;
    }
    .status-item, .preview-item {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      background: rgba(255,255,255,0.72);
    }
    .status-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 8px;
    }
    .pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      background: rgba(29,111,95,0.12);
      color: var(--accent);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }
    button {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
    }
    button.secondary { background: rgba(29,111,95,0.12); color: var(--accent); }
    button.danger { background: var(--danger); }
    form {
      display: grid;
      gap: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 14px;
      color: var(--muted);
    }
    input, select, textarea {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 12px;
      font: inherit;
      background: rgba(255,255,255,0.92);
      color: var(--text);
    }
    textarea { min-height: 90px; resize: vertical; }
    .inline {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
    }
    .meta, .note {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .result {
      white-space: pre-wrap;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      background: rgba(255,255,255,0.7);
      min-height: 120px;
      font-size: 14px;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>统一登录与发布面板</h1>
      <p>当前面板覆盖登录状态查看、GitHub 校验与注销，以及当前项目发布到 GitHub 的预览和执行入口。</p>
      <div class="note">当前 panel token 仅用于本地 API 防护，不代表官方插件登录态。面板只访问本地网关。</div>
    </section>
    <div class="grid">
      <section class="card">
        <h2>登录总览</h2>
        <div id="statusList" class="status-list"></div>
      </section>
      <section class="card">
        <h2>GitHub 发布</h2>
        <form id="publishForm">
          <label>项目绝对路径
            <input name="projectPath" required>
          </label>
          <label>GitHub 仓库链接
            <input name="repositoryUrl" required placeholder="https://github.com/<owner>/<repo>">
          </label>
          <label>首次 commit message
            <textarea name="commitMessage" required></textarea>
          </label>
          <label id="visibilityWrap" class="hidden">仓库可见性
            <select name="visibility">
              <option value="private">private</option>
              <option value="public">public</option>
            </select>
          </label>
          <label class="inline">
            <input type="checkbox" name="confirmStagePreview">
            我已确认待提交预览无误
          </label>
          <div class="actions">
            <button type="submit" data-mode="prepare">预览发布</button>
            <button type="submit" data-mode="execute">执行发布</button>
          </div>
        </form>
      </section>
    </div>
    <section class="card">
      <h2>发布预览 / 执行结果</h2>
      <div id="previewSummary" class="meta">先执行“预览发布”。</div>
      <div id="previewList" class="preview-list"></div>
      <div id="result" class="result"></div>
    </section>
  </div>
  <script>
    const panelToken = ${JSON.stringify(panelToken)};
    const statusList = document.getElementById("statusList");
    const previewSummary = document.getElementById("previewSummary");
    const previewList = document.getElementById("previewList");
    const result = document.getElementById("result");
    const form = document.getElementById("publishForm");
    const visibilityWrap = document.getElementById("visibilityWrap");
    let lastPreview = null;

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-panel-token": panelToken,
          ...(options.headers || {}),
        },
      });
      return response.json();
    }

    function renderResult(data) {
      result.textContent = JSON.stringify(data, null, 2);
    }

    function renderPreview(data) {
      previewList.innerHTML = "";
      const files = data?.preview?.files || [];
      previewSummary.textContent = files.length
        ? \`共 \${files.length} 项待提交变更。\`
        : (data?.message || "当前没有待提交内容。");
      for (const item of files) {
        const div = document.createElement("div");
        div.className = "preview-item";
        div.textContent = \`\${item.status}  \${item.path}\`;
        previewList.appendChild(div);
      }
      visibilityWrap.classList.toggle("hidden", !data?.requiredInputs?.visibility);
      lastPreview = data;
      renderResult(data);
    }

    function makeStatusItem(item) {
      const wrapper = document.createElement("div");
      wrapper.className = "status-item";
      wrapper.innerHTML = \`
        <div class="status-head">
          <strong>\${item.provider}</strong>
          <span class="pill">\${item.state}</span>
        </div>
        <div class="meta">账号：\${item.accountLabel || "未记录"}</div>
        <div class="meta">上次校验：\${item.lastValidatedAt || "未校验"}</div>
        <div class="meta">下一步：\${item.nextAction}</div>
        <div class="meta">\${item.message}</div>
      \`;
      if (item.provider === "github") {
        const actions = document.createElement("div");
        actions.className = "actions";
        const validate = document.createElement("button");
        validate.className = "secondary";
        validate.textContent = "重新校验";
        validate.onclick = async () => {
          const payload = await api("/api/auth/validate", {
            method: "POST",
            body: JSON.stringify({ provider: "github" }),
          });
          renderResult(payload);
          await loadStatuses();
        };
        const logout = document.createElement("button");
        logout.className = "danger";
        logout.textContent = "注销";
        logout.onclick = async () => {
          const payload = await api("/api/auth/logout", {
            method: "POST",
            body: JSON.stringify({ provider: "github" }),
          });
          renderResult(payload);
          await loadStatuses();
        };
        actions.append(validate, logout);
        wrapper.appendChild(actions);
      }
      return wrapper;
    }

    async function loadStatuses() {
      const data = await api("/api/status-overview", { method: "GET" });
      statusList.innerHTML = "";
      for (const item of data.summary || []) {
        statusList.appendChild(makeStatusItem(item));
      }
      renderResult(data);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = event.submitter?.dataset?.mode || "prepare";
      const formData = new FormData(form);
      const payload = {
        projectPath: String(formData.get("projectPath") || "").trim(),
        repositoryUrl: String(formData.get("repositoryUrl") || "").trim(),
      };
      if (mode === "prepare") {
        const data = await api("/api/github/publish/prepare", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        renderPreview(data);
        return;
      }
      payload.commitMessage = String(formData.get("commitMessage") || "").trim();
      payload.confirmStagePreview = Boolean(formData.get("confirmStagePreview"));
      if (lastPreview?.requiredInputs?.visibility) {
        payload.visibility = String(formData.get("visibility") || "");
        payload.createRepository = true;
      }
      const data = await api("/api/github/publish/execute", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      renderResult(data);
      if (data.preview) {
        renderPreview(data);
      }
      await loadStatuses();
    });

    loadStatuses().catch((error) => {
      result.textContent = error.message;
    });
  </script>
</body>
</html>`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function tokenFromRequest(req, url) {
  return req.headers["x-panel-token"] || url.searchParams.get("token");
}

function requireToken(req, res, panelToken, url) {
  const token = tokenFromRequest(req, url);
  if (token !== panelToken) {
    unauthorized(res);
    return false;
  }
  return true;
}

async function routeApi(req, res, url, handlers, panelToken) {
  if (!requireToken(req, res, panelToken, url)) {
    return;
  }
  try {
    if (req.method === "GET" && url.pathname === "/api/status-overview") {
      json(res, 200, await handlers.authStatusOverview());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/validate") {
      json(res, 200, await handlers.authValidate(await readJsonBody(req)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      json(res, 200, await handlers.authLogout(await readJsonBody(req)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/github/publish/prepare") {
      json(res, 200, await handlers.githubPublishPrepare(await readJsonBody(req)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/github/publish/execute") {
      json(res, 200, await handlers.githubPublishExecute(await readJsonBody(req)));
      return;
    }
    notFound(res);
  } catch (error) {
    logEvent("panel_api_error", { path: url.pathname, message: error.message });
    json(res, 500, {
      ok: false,
      status: "error",
      message: error.message,
    });
  }
}

export async function ensurePanelServer(handlers) {
  if (activePanel) {
    return activePanel;
  }
  const panelToken = crypto.randomUUID();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!requireToken(req, res, panelToken, url)) {
        return;
      }
      html(res, pageTemplate(panelToken));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url, handlers, panelToken);
      return;
    }
    notFound(res);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  activePanel = {
    server,
    host: "127.0.0.1",
    port: address.port,
    panelToken,
    url: `http://127.0.0.1:${address.port}/?token=${panelToken}`,
  };
  return activePanel;
}

export async function openPanelInChrome(panelUrl) {
  return openUrlInChrome(panelUrl);
}

export function closePanelServer() {
  if (!activePanel) {
    return;
  }
  activePanel.server.close();
  activePanel = null;
}

export async function closePanelServerAsync() {
  if (!activePanel) {
    return;
  }
  const current = activePanel;
  activePanel = null;
  await new Promise((resolve) => {
    current.server.close(() => resolve());
  });
}

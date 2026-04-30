import { spawn } from "node:child_process";

const child = spawn("node", ["./src/server.js"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});

function call(message) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const parsed = JSON.parse(line);
        if (parsed.id === message.id) {
          child.stdout.off("data", onData);
          resolve(parsed);
          return;
        }
      }
    };
    child.stdout.on("data", onData);
    child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) {
        child.stdout.off("data", onData);
        reject(error);
      }
    });
  });
}

const initialize = await call({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {},
});

const tools = await call({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
});

const providers = await call({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "auth_list_providers",
    arguments: {},
  },
});

const panel = await call({
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: {
    name: "ui_open_panel",
    arguments: {},
  },
});

console.log(JSON.stringify({ initialize, tools, providers, panel }, null, 2));
child.kill();

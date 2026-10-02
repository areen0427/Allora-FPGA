import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** A stdio client exercising the shipped executable, not a mock tool server. */
export class McpClient {
  constructor(binary, env) {
    this.nextId = 0;
    this.pending = new Map();
    this.stderr = "";
    this.elicitations = [];
    this.process = spawn(binary, ["--allora-mcp"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-16000);
    });
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method && message.id !== undefined) {
        this.elicitations.push(message);
        // This test client must never authorize an actual hardware upload.
        this.write({ jsonrpc: "2.0", id: message.id, result: { action: "decline", content: null } });
      } else if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      }
    });
    this.process.once("error", (error) => this.fail(error));
    this.process.once("exit", (code) => this.fail(new Error(`MCP exited (${code}): ${this.stderr}`)));
  }

  fail(error) {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }

  write(message) {
    this.process.stdin.write(JSON.stringify(message) + "\n");
  }

  request(method, params, timeoutMs = 30000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out: ${this.stderr}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { elicitation: { form: {} } },
      clientInfo: { name: "allora-integration-tests", version: "1.0" },
    });
    this.write({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  call(name, args) {
    return this.request("tools/call", { name, arguments: args });
  }

  async close() {
    if (this.process.exitCode !== null) return;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { this.process.kill(); resolve(); }, 3000);
      this.process.once("exit", () => { clearTimeout(timeout); resolve(); });
      this.process.stdin.end();
    });
  }
}

export function toolValue(result) {
  if (result.isError) throw new Error(result.content?.map((part) => part.text ?? "").join("\n") ?? "Tool failed");
  if (result.structuredContent) return result.structuredContent;
  return JSON.parse(result.content.find((part) => part.type === "text").text);
}

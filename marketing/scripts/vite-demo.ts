import type { Plugin } from "../../allora-fpga/node_modules/vite/dist/node/index";
import { timingSafeEqual } from "node:crypto";

// Dev-server-only transport. No socket, endpoint or token enters a release build.
export function demoBridge(token: string): Plugin {
  let nextId = 0;
  let pending: { id: number; command: unknown } | null = null;
  let finish: ((value: unknown) => void) | undefined;
  return {
    name: "allora-marketing-demo",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__allora_demo", async (req, res) => {
        const supplied = Buffer.from(
          String(req.headers["x-allora-demo-token"] ?? ""),
        );
        const expected = Buffer.from(token);
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        ) {
          res.writeHead(403).end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "GET" && req.url === "/poll") {
          res.end(JSON.stringify(pending));
          pending = null;
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) {
            res.writeHead(413).end();
            return;
          }
        }
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400).end();
          return;
        }
        if (req.method === "POST" && req.url === "/result") {
          if (data.id === nextId) finish?.(data);
          res.end("{}");
          return;
        }
        if (req.method !== "POST" || req.url !== "/command") {
          res.writeHead(404).end();
          return;
        }
        if (finish) {
          res.writeHead(409).end("Busy");
          return;
        }
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            pending = null;
            finish = undefined;
            resolve({ error: "Demo command timed out after 120 seconds" });
          }, 120000);
          finish = (value) => {
            clearTimeout(timeout);
            finish = undefined;
            resolve(value);
          };
          pending = { id: ++nextId, command: data };
        });
        res.end(JSON.stringify(result));
      });
    },
  };
}

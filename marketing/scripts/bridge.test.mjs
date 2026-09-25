import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { demoBridge } from "./vite-demo.ts";

test("dev transport rejects unauthenticated requests and serializes acknowledged commands", async () => {
  let handler;
  demoBridge("test-token").configureServer({
    middlewares: {
      use: (_route, fn) => {
        handler = fn;
      },
    },
  });
  function request(method, url, data, token = "test-token") {
    const req = Readable.from(data === undefined ? [] : [JSON.stringify(data)]);
    Object.assign(req, {
      method,
      url,
      headers: { "x-allora-demo-token": token },
    });
    const result = { status: 200, body: "" };
    const res = {
      setHeader() {},
      writeHead(status) {
        result.status = status;
        return this;
      },
      end(body) {
        result.body = body ?? "";
        return this;
      },
    };
    return handler(req, res).then(() => result);
  }
  assert.equal((await request("GET", "/poll", undefined, "wrong")).status, 403);
  assert.equal(
    (await request("POST", "/command", { action: "home" }, "")).status,
    403,
  );
  const pending = request("POST", "/command", { action: "home" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    (await request("POST", "/command", { action: "home" })).status,
    409,
  );
  const job = JSON.parse((await request("GET", "/poll")).body);
  assert.equal(job.command.action, "home");
  assert.equal(JSON.parse((await request("GET", "/poll")).body), null);
  await request("POST", "/result", { id: job.id, result: { completed: true } });
  assert.equal(JSON.parse((await pending).body).result.completed, true);
});

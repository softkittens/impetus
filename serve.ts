import { serve, spawn } from "bun";

const root = new URL("./app/", import.meta.url).pathname;

// Optionally start bundler in watch mode
if (process.env.SPARKLE_WATCH === '1') {
  const child = spawn({
    cmd: ["bun", "build", "src/index.ts", "--outfile", "app/sparkle.js", "--target", "browser", "--format", "esm", "--watch"],
    stdout: "inherit",
    stderr: "inherit",
  });
  console.log("[dev] build:watch started (pid:", child.pid, ")");
}

serve({
  port: 5173,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    try {
      const file = Bun.file(root + path);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(file);
    } catch (e) {
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log("Dev server running at http://localhost:5173");

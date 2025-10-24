import { serve } from "bun";

const root = new URL("./app/", import.meta.url).pathname;

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

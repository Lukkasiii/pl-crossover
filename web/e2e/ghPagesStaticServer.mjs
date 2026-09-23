// Emulates GitHub Pages' actual serving behaviour for a static SPA build --
// not `vite preview`'s own history-fallback, which is more permissive than
// a real static host and would hide exactly the class of bug this server
// exists to catch (see production-base.spec.ts and CLAUDE.md).
//
// GitHub Pages: an exact file match is served as-is; a directory-style path
// with no matching file (no extension, most often) falls back to that
// path's own index.html if one exists -- the same "try $uri, then
// $uri/index.html" order every static host uses, and precisely what
// scripts/prerender-routes.mjs exists to give the seven known routes.
// Anything neither of those matches gets the *content* of 404.html with a
// 404 status, and the browser's address bar does not change. That "content
// served, URL untouched" behaviour is what makes client-side routing
// recover on a direct hit to a route with no prerendered file (an
// unlisted path, or /teams/:slug) -- and it only works if dist/404.html
// exists (see package.json's postbuild:demo).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT ?? 4174);
const BASE = process.env.BASE_PATH ?? "/pl-crossover/";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
}

function toDistPath(pathname) {
  const stripped = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, "");
  return stripped === "" ? "index.html" : stripped;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const relative = toDistPath(pathname);
  const candidates = relative.endsWith(".html") ? [relative] : [relative, `${relative}/index.html`];

  for (const candidate of candidates) {
    try {
      const data = await readFile(path.join(DIST, candidate));
      res.writeHead(200, { "content-type": contentType(candidate) });
      res.end(data);
      return;
    } catch {
      // try the next candidate
    }
  }

  try {
    const fallback = await readFile(path.join(DIST, "404.html"));
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(fallback);
  } catch {
    // No 404.html fallback built -- a real unrecoverable 404, exactly
    // what a broken postbuild:demo step would produce on GitHub Pages.
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404: no dist/404.html fallback");
  }
});

server.listen(PORT, () => {
  console.log(`ghPagesStaticServer: serving ${DIST} at http://localhost:${PORT}${BASE}`);
});

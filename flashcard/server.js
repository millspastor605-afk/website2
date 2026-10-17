const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const DECKS_DIR = path.join(ROOT, "decks");
const PORT = 8000;

fs.mkdirSync(DECKS_DIR, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (pathname === "/api/decks") {
    const files = fs.readdirSync(DECKS_DIR)
      .filter(name => name.toLowerCase().endsWith(".json"))
      .map(name => {
        let title = name.replace(/\.json$/i, "");
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, name), "utf8"));
          if (data.title) title = String(data.title);
        } catch {
          // The app will show an error if the deck JSON is invalid.
        }
        return { name, title };
      });

    return send(res, 200, "application/json; charset=utf-8", JSON.stringify(files));
  }

  if (pathname.startsWith("/api/decks/")) {
    const filename = decodeURIComponent(pathname.slice("/api/decks/".length));

    if (path.basename(filename) !== filename || !filename.toLowerCase().endsWith(".json")) {
      return send(res, 400, "text/plain; charset=utf-8", "Invalid deck filename");
    }

    const filePath = path.join(DECKS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return send(res, 404, "text/plain; charset=utf-8", "Deck not found");
    }

    return send(res, 200, "application/json; charset=utf-8", fs.readFileSync(filePath));
  }

  let filePath = path.join(ROOT, pathname === "/" ? "index.html" : pathname.slice(1));
  filePath = path.resolve(filePath);

  if (!filePath.startsWith(path.resolve(ROOT) + path.sep) && filePath !== path.join(ROOT, "index.html")) {
    return send(res, 403, "text/plain; charset=utf-8", "Forbidden");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  }

  const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  send(res, 200, contentType, fs.readFileSync(filePath));
});

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`Flashcards running at http://localhost:${PORT}`);
});

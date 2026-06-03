import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeImage, getVisionStatus } from "./lib/vision.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      ...getVisionStatus()
    });
    return;
  }

  if (request.url === "/api/analyze-image" && request.method === "POST") {
    try {
      const body = JSON.parse(await readBody(request));
      const result = await analyzeImage(body);
      sendJson(response, result.error && !result.setup_required ? 400 : 200, result);
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Unexpected server error."
      });
    }
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, () => {
  const { provider, visionModel } = getVisionStatus();
  console.log(`Nano Prompt Foundry server running at http://localhost:${port}`);
  console.log(`Vision provider: ${provider}`);
  console.log(`Vision model: ${visionModel}`);
});

import { analyzeImage } from "../lib/vision.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb"
    }
  }
};

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Use POST for image analysis." });
    return;
  }

  try {
    const result = await analyzeImage(await readJsonBody(request));
    response.status(result.error && !result.setup_required ? 400 : 200).json(result);
  } catch (error) {
    response.status(500).json({
      error: error.message || "Unexpected server error."
    });
  }
}

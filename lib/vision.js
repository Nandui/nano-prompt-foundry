const provider = (process.env.AI_PROVIDER || "apiyi").toLowerCase();
const openaiVisionModel = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
const apiyiVisionModel = process.env.APIYI_VISION_MODEL || "gemini-2.5-pro";
const apiyiBaseUrl = (process.env.APIYI_BASE_URL || "https://api.apiyi.com/v1").replace(/\/$/, "");
const visionModel = provider === "apiyi" ? apiyiVisionModel : openaiVisionModel;

const roleInstructions = {
  face:
    "Analyze only the face/identity reference. Describe face shape, age impression, expression, hair, skin texture, makeup, eyewear/facial hair if present, and identity-critical details. Do not infer private identity. Return fields: description, parts.face_shape, parts.hair, parts.expression, parts.skin_texture, parts.makeup, parts.identity_anchors, parts.do_not_transfer.",
  body:
    "Analyze only the body reference. Prioritize the visible body itself: overall build, proportions, height impression, shoulder width, torso length, waist/hip relationship, limb length, leg shape, posture baseline, silhouette, visible muscle/softness, and body-angle cues. Then briefly add pose/framing only after the body description. Do not describe face identity, attractiveness, ethnicity, or private/sensitive traits. Return fields: description, parts.overall_build, parts.proportions, parts.shoulders, parts.torso, parts.waist_hips, parts.arms_hands, parts.legs, parts.posture_pose, parts.silhouette, parts.framing.",
  outfit:
    "Analyze only the outfit reference. Produce a complete head-to-toe wardrobe inventory. Describe every visible garment and styling item: tops, bottoms such as skirt/pants/shorts, outerwear, footwear, bags, jewelry, belts, hair accessories, socks/tights, colors, fabrics, fit, layers, seams, textures, prints/logos/text, and material behavior. Do not stop after the top garment. If a garment category is not visible or is cropped/occluded, explicitly say so. Do not use it for face identity or background. Return fields: description, parts.top, parts.bottom, parts.outerwear, parts.footwear, parts.bag, parts.jewelry_accessories, parts.belt, parts.hosiery_socks, parts.hair_accessories, parts.colors_materials, parts.fit_layers, parts.logos_text, parts.missing_or_cropped.",
  scene:
    "Analyze only the environment/place reference. Describe location type, architecture, layout, lighting direction, color temperature, weather, depth, surface materials, reflections, atmosphere, and lens perspective. Do not describe or transfer people, faces, bodies, poses, outfits, actions, identity, readable text, logos, or foreground subjects. Return fields: description, parts.place_type, parts.layout_architecture, parts.lighting, parts.color_temperature, parts.weather_atmosphere, parts.depth_perspective, parts.surfaces_materials, parts.reflections, parts.exclusions."
};

export function getVisionStatus() {
  return {
    provider,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    hasApiyiKey: Boolean(process.env.APIYI_API_KEY),
    visionModel,
    apiyiBaseUrl: provider === "apiyi" ? apiyiBaseUrl : undefined
  };
}

export function analysisPrompt(role, metadata) {
  return [
    "Return accurate visual analysis JSON for a Nano Banana Pro / Nano Banana 2 prompt builder.",
    "Do not mention that you are an AI. Do not add guesses that are not visually supported.",
    roleInstructions[role] || roleInstructions.face,
    "Write concrete visual details that help another image model use the reference correctly.",
    "Avoid generic camera-first phrasing unless the role is camera/composition related. Focus on the role's actual subject.",
    "For scene references, keep it environment-only and explicitly ignore any people or foreground subject content.",
    role === "body"
      ? "For body references, write 4-6 short bullet-like clauses in one paragraph, starting with body build and proportions. The body analysis must not be mainly a pose description."
      : "",
    role === "outfit"
      ? "For outfit references, scan from head to toe and write a complete inventory in this order when visible: top, bottom, outer layer, footwear, bag, jewelry/accessories, notable styling details. Mention cropped or hidden categories instead of omitting them."
      : "",
    `Image metadata from browser: ${metadata?.summary || "not available"}.`,
    "Keep the JSON compact. Limit description to 45 words and each parts value to 25 words or fewer.",
    "Return only valid JSON, no markdown, with this shape: {\"description\":\"concise complete description\",\"parts\":{...}}. Use empty strings only when a detail is truly not visible."
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseStructuredAnalysis(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function textFromContent(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => textFromContent(item)).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    return [
      value.text,
      value.output_text,
      value.content,
      value.message,
      value.reasoning_content,
      value.parts
    ]
      .map((item) => textFromContent(item))
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractProviderText(payload) {
  return [
    payload?.output_text,
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.message?.reasoning_content,
    payload?.choices?.[0]?.delta?.content,
    payload?.candidates?.[0]?.content?.parts,
    payload?.candidates?.[0]?.content,
    payload?.output?.[0]?.content
  ]
    .map((item) => textFromContent(item))
    .find((text) => text.trim()) || "";
}

function looksLikeTruncatedJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return false;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }
  }

  return depth !== 0 || inString || escaped || !trimmed.endsWith("}");
}

function emptyProviderError(payload, providerName) {
  const choice = payload?.choices?.[0];
  const candidate = payload?.candidates?.[0];
  const details = [
    choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : "",
    candidate?.finishReason ? `finish_reason=${candidate.finishReason}` : "",
    payload?.usage?.total_tokens ? `tokens=${payload.usage.total_tokens}` : "",
    payload?.error?.message || payload?.message || ""
  ]
    .filter(Boolean)
    .join("; ");

  return `${providerName} returned an empty analysis response${details ? ` (${details})` : ""}. Try again, or use a smaller/clearer image.`;
}

function buildAnalysisResult(payload, providerName) {
  const text = extractProviderText(payload).trim();
  if (!text) {
    return {
      error: emptyProviderError(payload, providerName),
      model: visionModel,
      provider: providerName
    };
  }

  const structured = parseStructuredAnalysis(text);
  if (!structured && looksLikeTruncatedJson(text)) {
    return {
      error: `${providerName} returned incomplete JSON analysis. The response was likely cut off by the model/provider. Try Analyze again.`,
      model: visionModel,
      provider: providerName
    };
  }

  return {
    analysis: structured?.description || text,
    structured_analysis: structured || {
      description: text,
      parts: {}
    },
    model: visionModel,
    provider: providerName
  };
}

export async function analyzeImage({ role, imageDataUrl, metadata }) {
  if (!imageDataUrl?.startsWith("data:image/")) {
    return { error: "Expected an uploaded image data URL." };
  }

  if (provider === "apiyi") {
    return analyzeWithApiyi({ role, imageDataUrl, metadata });
  }

  return analyzeWithOpenAI({ role, imageDataUrl, metadata });
}

async function analyzeWithOpenAI({ role, imageDataUrl, metadata }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      setup_required: true,
      error: "OPENAI_API_KEY is not set. Add it to Vercel or start locally with the variable set."
    };
  }

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: visionModel,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: analysisPrompt(role, metadata) },
            { type: "input_image", image_url: imageDataUrl, detail: "high" }
          ]
        }
      ]
    })
  });

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    return { error: payload.error?.message || "OpenAI vision analysis failed." };
  }

  return buildAnalysisResult(payload, "openai");
}

async function analyzeWithApiyi({ role, imageDataUrl, metadata }) {
  if (!process.env.APIYI_API_KEY) {
    return {
      setup_required: true,
      error: "APIYI_API_KEY is not set. Add it to Vercel or start locally with the variable set."
    };
  }

  const apiResponse = await fetch(`${apiyiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIYI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: analysisPrompt(role, metadata) },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 2600
    })
  });

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    return { error: payload.error?.message || payload.message || "APIYi Gemini vision analysis failed." };
  }

  return buildAnalysisResult(payload, "apiyi");
}

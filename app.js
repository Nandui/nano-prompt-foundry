const imageRoles = [
  {
    id: "face",
    title: "Face",
    meta: "identity, expression, skin texture",
    apiRole: (n) => `Use Image ${n} as the face and identity reference.`
  },
  {
    id: "body",
    title: "Body",
    meta: "body, proportions, pose",
    apiRole: (n) => `Use Image ${n} as the body, proportions, pose, gesture, and silhouette reference.`
  },
  {
    id: "outfit",
    title: "Outfit",
    meta: "garments, fabric, styling",
    apiRole: (n) => `Use Image ${n} as the outfit, garment material, accessories, footwear, and fit reference.`
  },
  {
    id: "scene",
    title: "Scene",
    meta: "place, light, atmosphere",
    apiRole: (n) =>
      `Use Image ${n} only as the place/environment reference: location, architecture, layout, lighting, color temperature, weather, depth, surface materials, lens perspective, reflections, and atmosphere. Do not copy any person, pose, outfit, face, body, action, identity, readable text, logo, or foreground subject from this scene image.`
  }
];

const fields = ["model", "identity", "body", "outfit", "scene", "camera", "lighting", "realism", "negative", "resolution"];
const PROMPT_CHAR_LIMIT = 15000;
const apiBase = window.location.protocol === "file:" ? "http://localhost:4173" : "";

const state = {
  ratio: "4:5",
  activeLibrary: "picture",
  selectedPresets: [],
  autoAnalyze: true,
  analysisStatus: Object.fromEntries(imageRoles.map((role) => [role.id, ""])),
  analysisInFlight: Object.fromEntries(imageRoles.map((role) => [role.id, false])),
  images: Object.fromEntries(imageRoles.map((role) => [role.id, null]))
};

const instagramRealismLock = [
  "Authentic Instagram photo quality, not AI art, not plastic, not studio-perfect advertising.",
  "Preserve natural skin texture: pores, fine lines, under-eye texture, tiny blemishes, body texture, facial asymmetry, and normal human variation.",
  "No airbrushed skin, no porcelain smoothing, no waxy highlights, no beauty-filter face reshape, no synthetic glow, no AI-clean background.",
  "Use believable phone-camera or real-camera processing: mild sensor noise, natural sharpening, realistic dynamic range, subtle compression, and true lens perspective.",
  "Hands, teeth, eyes, hairline, ears, jewelry, nails, fabric seams, reflections, and background edges must be physically plausible.",
  "Make it feel like a real creator post: lived-in environment, real shadows, natural pose, tiny imperfections, and realistic color grade."
];

const sceneReferenceIsolation = [
  "The scene reference image is background/environment data only.",
  "Extract only place type, layout, architecture, lighting direction, color temperature, weather, depth cues, lens perspective, material surfaces, shadows, reflections, and atmosphere.",
  "Never transfer people, faces, body shape, pose, outfit, accessories, hairstyle, action, identity, signage text, logos, captions, props held by people, or story content from the scene reference.",
  "The subject must come from the face/body/outfit slots and written prompt only."
];

const referencePolicies = {
  face: {
    use_for: ["identity", "facial geometry", "expression character", "skin texture", "hairline"],
    do_not_transfer: ["background", "outfit unless no outfit reference exists", "scene lighting if a scene reference exists"]
  },
  body: {
    use_for: ["body build", "proportions", "posture", "pose", "gesture", "silhouette"],
    do_not_transfer: ["identity", "face details", "background", "outfit unless no outfit reference exists"]
  },
  outfit: {
    use_for: ["garments", "fabric texture", "fit", "layers", "accessories", "footwear"],
    do_not_transfer: ["face identity", "body proportions", "background environment"]
  },
  scene: {
    use_for: ["place type", "environment layout", "lighting", "weather", "depth cues", "surface materials", "reflections", "atmosphere"],
    do_not_transfer: ["people", "faces", "body shape", "pose", "outfit", "accessories", "hairstyle", "action", "identity", "readable text", "logos", "captions", "foreground subject"]
  }
};

const analysisPlaceholders = {
  face: "Describe the face accurately: age impression, face shape, hair, expression, skin texture, makeup, eyewear, facial hair, identity-critical details, and what must not drift.",
  body: "Describe the body itself first: build, proportions, shoulder width, torso length, waist/hip relationship, limb length, leg shape, silhouette, posture baseline, and body angle. Add pose/framing after that.",
  outfit: "Describe the full outfit head to toe: top, skirt/pants/shorts, outerwear, footwear, bag, jewelry, belt, hair accessories, socks/tights, colors, fabrics, fit, seams, logos/text, and material behavior. Mention cropped or hidden categories.",
  scene: "Describe only the place/environment: location type, architecture, layout, lighting direction, color temperature, weather, depth, surfaces, reflections, and atmosphere. Do not describe people, outfits, pose, or action from the scene image."
};

const presetLibraries = {
  picture: [
    preset("fit-check", "Full-body fit check", "head-to-toe outfit post", {
      body: "Relaxed full-body fit-check pose with natural weight shift, visible posture, believable limb proportions, and hands placed casually without hiding anatomy.",
      camera: "Vertical 4:5 fashion post, eye-level or slightly low phone-camera perspective, full-body framing with floor context, realistic smartphone sharpness.",
      realism: "Creator-style realism with visible fabric texture, natural posture, slight candid imperfection, real skin texture, and no showroom polish."
    }),
    preset("mirror-selfie", "Mirror selfie", "bedroom, elevator, dressing room", {
      scene: "Mirror-selfie environment only: real reflective surface, perspective asymmetry, believable room details, surface texture, and natural reflection geometry.",
      camera: "Smartphone mirror selfie composition, vertical social crop, phone visible only if it matches the prompt, realistic reflection geometry.",
      lighting: "Soft available indoor light mixed with subtle screen or window glow, realistic mirror reflections, gentle shadow falloff."
    }),
    preset("street-candid", "Street candid", "walking shot, urban background", {
      body: "Candid mid-stride pose with natural shoulder angle, relaxed hands, slight fabric movement, and believable walking balance.",
      scene: "Everyday city street environment only: storefronts, pavement, parked cars, scale cues, natural depth, indistinct background pedestrians if present.",
      camera: "Vertical editorial street photo, 35mm lens feel, eye-level framing, subject sharp with mild environmental motion."
    }),
    preset("restaurant-flash", "Restaurant flash", "night-out table photo", {
      scene: "Restaurant or lounge environment only: tableware, ambient blur, warm practical lights, seating layout, reflective surfaces, believable crowded depth.",
      camera: "Direct-flash nightlife portrait, vertical 4:5 crop, close-to-mid framing, crisp foreground detail with natural falloff.",
      lighting: "On-camera flash mixed with warm practical lighting, realistic specular highlights, visible skin texture, natural subject shadow."
    }),
    preset("car-selfie", "Car selfie", "front-seat light", {
      scene: "Real car interior environment only: seat texture, window reflections, dashboard hints, glass color cast, and softly visible outside context.",
      camera: "Front-seat smartphone selfie or portrait crop, close-to-mid framing, natural wide-lens perspective, realistic skin detail.",
      lighting: "Window light through car glass, natural reflections, soft shadows, true skin color, mild phone HDR."
    }),
    preset("travel-editorial", "Travel editorial", "destination lifestyle", {
      scene: "Travel environment only: recognizable location cues, tourist-scale background detail, believable weather, architecture or landscape depth, natural surface texture.",
      camera: "Editorial travel portrait, 3:2 or 4:5 crop, 35mm lens feel, subject off-center with scenic context, clean but not staged composition.",
      lighting: "Natural outdoor light with realistic sun direction, ambient bounce, preserved sky detail, believable shadows."
    })
  ],
  scene: [
    preset("golden-balcony", "Golden balcony", "warm terrace", { scene: "Apartment or hotel balcony at golden hour with railing, city or garden depth, warm wall bounce, real floor texture, and subtle haze.", lighting: "Low side sun, warm rim light, soft bounce shadows, natural skin warmth without orange overgrading." }),
    preset("clean-bedroom", "Clean bedroom", "window light", { scene: "Real clean bedroom with linens, wardrobe or mirror, subtle personal objects, realistic proportions, no showroom staging.", lighting: "Large window light, soft directional shadows, gentle ambient fill, natural color temperature." }),
    preset("rooftop-night", "Rooftop night", "city lights", { scene: "Urban rooftop at night with city lights, safety railing, concrete or tile surface, believable depth, and slight evening atmosphere.", lighting: "Mixed city ambient light, practical highlights, realistic low-light grain, controlled face visibility without fake studio light." }),
    preset("beach-walk", "Beach walk", "sand and shore", { scene: "Natural beach shoreline with textured sand, waterline, indistinct distant people if present, wind movement, and realistic horizon placement.", lighting: "Soft coastal light, reflective sand bounce, gentle highlights, realistic wind-driven hair and fabric shadows." }),
    preset("airport", "Airport travel", "terminal and luggage", { scene: "Airport terminal or travel corridor with luggage, polished floors, unreadable signage, glass, and realistic depth cues.", lighting: "Large indoor terminal light, reflective floor bounce, neutral white balance, realistic phone-camera sharpness." }),
    preset("cafe-window", "Cafe window", "table and street depth", { scene: "Cafe table by a window with coffee, glass reflections, street depth outside, wood or stone table texture, believable background blur.", lighting: "Soft window light, warm interior practicals, natural face shadows, realistic highlights on glassware." })
  ],
  camera: [
    preset("phone-main", "Phone main lens", "social-photo sharpness", { camera: "Modern smartphone main camera look, vertical crop, natural wide-lens perspective without exaggeration, crisp subject detail, realistic computational HDR." }),
    preset("phone-tele", "Phone telephoto", "compressed portrait", { camera: "Smartphone telephoto portrait look, mild background compression, natural depth separation, sharp face and outfit, realistic social-media crop." }),
    preset("front-camera", "Front camera", "selfie perspective", { camera: "Smartphone front-camera selfie look, close-to-mid crop, slight wide-lens perspective, realistic face proportions without beautify filtering." }),
    preset("35mm", "35mm candid", "environmental frame", { camera: "35mm environmental portrait, eye-level framing, subject integrated with surroundings, natural perspective, mild background falloff." }),
    preset("50mm", "50mm portrait", "balanced realism", { camera: "50mm portrait lens feel, realistic perspective, controlled depth of field, clean subject separation, no artificial bokeh halos." }),
    preset("compact-flash", "Compact flash", "night snapshot", { camera: "Compact digital camera or disposable flash look, vertical snapshot crop, crisp flash-lit foreground, slight grain, real-world lens imperfections." })
  ],
  pose: [
    preset("contrapposto", "Contrapposto", "natural weight shift", { body: "Natural contrapposto stance with weight on one leg, subtle hip shift, relaxed shoulders, grounded feet, and hands visible." }),
    preset("walking", "Walking candid", "mid-stride", { body: "Natural mid-stride walking pose with believable balance, slight fabric motion, relaxed hands, and realistic foot placement." }),
    preset("seated", "Seated casual", "chair or curb", { body: "Casual seated pose with natural spine curve, knees and hands placed plausibly, no hidden or fused fingers, realistic clothing folds." }),
    preset("leaning", "Leaning pose", "wall or railing", { body: "Subject lightly leaning on a wall or railing with relaxed shoulders, believable contact point, natural arm angle, and grounded posture." }),
    preset("over-shoulder", "Over shoulder", "turning glance", { body: "Over-the-shoulder pose with torso rotation, natural neck angle, visible body silhouette, and believable shoulder alignment." }),
    preset("mirror-phone", "Phone-in-hand", "creator selfie", { body: "Casual phone-in-hand pose with visible grip, natural arm bend, realistic hand anatomy, and relaxed creator-post posture." })
  ],
  lighting: [
    preset("window", "Window light", "soft side light", { lighting: "Large soft window light from one side, natural shadow falloff, preserved skin texture, realistic room bounce and white balance." }),
    preset("golden", "Golden hour", "warm rim", { lighting: "Low warm sun with realistic rim light, soft bounce shadows, detailed skin texture, and restrained golden color grade." }),
    preset("overcast", "Overcast", "soft outdoor", { lighting: "Soft overcast outdoor light, broad shadowless illumination, muted highlights, realistic natural color and background depth." }),
    preset("direct-flash", "Direct flash", "night-out realism", { lighting: "On-camera direct flash with crisp foreground, realistic hard shadow, mild grain, natural specular highlights, no waxy skin." }),
    preset("neon", "Neon practicals", "night color", { lighting: "Mixed neon and practical ambient light, believable color cast, realistic low-light grain, face still readable, no synthetic glow." }),
    preset("bathroom", "Bathroom light", "mirror practicals", { lighting: "Bathroom overhead and mirror light, realistic skin texture, slight phone HDR, believable tile and glass reflections." })
  ],
  realism: [
    preset("no-ai-skin", "Natural skin", "pores and texture", { realism: "Emphasize normal skin texture: pores, fine lines, tiny blemishes, under-eye texture, body texture, facial asymmetry. No poreless or plastic skin." }),
    preset("phone-post", "Phone post", "creator upload", { realism: "Feels like a real Instagram upload from a phone: mild compression, natural sharpening, tiny exposure imperfections, realistic HDR, no generated-image cleanliness." }),
    preset("fabric-detail", "Fabric detail", "seams and folds", { realism: "Clothing must show fabric weave, seams, hems, wrinkles, stretch, weight, stitching, and material behavior without plastic smoothness." }),
    preset("hands-lock", "Hands lock", "anatomy guard", { negative: "Avoid extra fingers, fused fingers, missing knuckles, distorted nails, melted jewelry, broken wrists, impossible hand grips, and hidden anatomy shortcuts." }),
    preset("background-real", "Real background", "not AI-clean", { realism: "Background should have ordinary imperfections, real edges, subtle clutter if appropriate, correct reflections, contact shadows, and believable depth." }),
    preset("anti-retouch", "Anti-retouch", "no airbrush", { negative: "No airbrushed face, no waxy highlights, no face reshaping, no plastic body texture, no AI glamour filter, no overly clean studio-perfect finish." })
  ]
};

function preset(id, title, meta, fields) {
  return { id, title, meta, fields };
}

const els = {
  dropzones: document.getElementById("dropzones"),
  presetGrid: document.getElementById("presetGrid"),
  providerStatus: document.getElementById("providerStatus"),
  analyzeAll: document.getElementById("analyzeAll"),
  clearPresets: document.getElementById("clearPresets"),
  copyJson: document.getElementById("copyJson"),
  copyStatus: document.getElementById("copyStatus"),
  jsonOutput: document.getElementById("jsonOutput"),
  jsonHighlighted: document.getElementById("jsonHighlighted")
};

function iconSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path></svg>`;
}

function renderDropzones() {
  els.dropzones.innerHTML = imageRoles.map((role) => {
    const image = state.images[role.id];
    const status = state.analysisStatus[role.id];
    return `
      <article class="dropzone ${image ? "has-image" : ""}">
        <div class="thumb">${image ? `<img src="${image.preview}" alt="${role.title} reference" />` : iconSvg()}</div>
        <div class="upload-copy">
          <div class="upload-title">${role.title}</div>
          <div class="upload-meta">${role.meta}</div>
          <label class="upload-button">Choose image<input type="file" accept="image/*" data-upload="${role.id}" /></label>
        </div>
        ${image ? `
          <label class="analysis-field">
            <span>AI visual analysis</span>
            <textarea data-analysis="${role.id}" placeholder="${analysisPlaceholders[role.id]}">${escapeTextarea(image.analysis || "")}</textarea>
            <div class="analysis-actions">
              <small>${status || image.metadata.summary}</small>
              <button class="analysis-button" type="button" data-analyze="${role.id}">${state.analysisInFlight[role.id] ? "Analyzing" : "Analyze"}</button>
            </div>
          </label>` : ""}
      </article>`;
  }).join("");

  document.querySelectorAll("[data-upload]").forEach((input) => input.addEventListener("change", handleUpload));
  document.querySelectorAll("[data-analysis]").forEach((input) => input.addEventListener("input", handleAnalysisInput));
  document.querySelectorAll("[data-analyze]").forEach((button) => button.addEventListener("click", () => analyzeImage(button.dataset.analyze, { force: true })));
}

function renderPresetGrid() {
  const presets = presetLibraries[state.activeLibrary] || [];
  els.presetGrid.innerHTML = presets.map((item) => {
    const active = state.selectedPresets.some((selected) => selected.id === item.id);
    return `<button class="preset-card ${active ? "active" : ""}" type="button" data-preset="${item.id}"><strong>${item.title}</strong><span>${item.meta}</span></button>`;
  }).join("");
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
}

function applyPreset(id) {
  const item = (presetLibraries[state.activeLibrary] || []).find((presetItem) => presetItem.id === id);
  if (!item) return;
  Object.entries(item.fields).forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = value;
  });
  state.selectedPresets = [
    ...state.selectedPresets.filter((selected) => selected.category !== state.activeLibrary),
    { category: state.activeLibrary, id: item.id, title: item.title, prompt_effect: item.fields }
  ];
  renderPresetGrid();
  updateOutput();
}

function readField(id) {
  const field = document.getElementById(id);
  return field?.value?.trim?.() || "";
}

function nearestSimpleAspect(width, height) {
  const ratio = width / height;
  const candidates = [["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["2:3", 0.667], ["3:2", 1.5], ["4:3", 1.333], ["16:9", 1.778], ["9:16", 0.562]];
  return candidates.reduce((best, current) => {
    const delta = Math.abs(current[1] - ratio);
    return delta < best.delta ? { label: current[0], delta } : best;
  }, { label: "custom", delta: Infinity }).label;
}

function loadImageMetadata(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const orientation = width === height ? "square" : width > height ? "landscape" : "portrait";
      const aspect = nearestSimpleAspect(width, height);
      resolve({ width, height, orientation, aspect, summary: `${width}x${height}, ${orientation}, approx. ${aspect}` });
    };
    image.onerror = () => resolve({ width: null, height: null, orientation: "unknown", aspect: "unknown", summary: "Image dimensions unavailable" });
    image.src = dataUrl;
  });
}

function attachedImageRoles() {
  return imageRoles.filter((role) => state.images[role.id]).map((role, index) => ({ ...role, imageNumber: index + 1, image: state.images[role.id] }));
}

function cleanParts(parts = {}) {
  return Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value || ""]));
}

function roleStructured(roleId) {
  const image = state.images[roleId];
  if (!image) return null;
  const structured = image.structuredAnalysis || {};
  return { description: structured.description || image.analysis?.trim() || "", parts: cleanParts(structured.parts || {}) };
}

function imageAnalysisText(role) {
  const policy = referencePolicies[role.id];
  const structured = roleStructured(role.id);
  const description = role.image.analysis?.trim();
  return [
    `Image ${role.imageNumber} (${role.title} reference):`,
    `Role relation: ${role.apiRole(role.imageNumber)}`,
    `Visual description: ${description || `AI visual analysis has not been completed for this uploaded image yet. Current analysis status: ${state.analysisStatus[role.id] || "queued/not run"}. Do not treat metadata alone as a visual description.`}`,
    structured?.parts && Object.keys(structured.parts).length ? `Structured parts: ${JSON.stringify(structured.parts)}` : "",
    `Basic metadata: ${role.image.metadata.summary}`,
    `Use for: ${policy.use_for.join(", ")}.`,
    `Do not transfer: ${policy.do_not_transfer.join(", ")}.`
  ].filter(Boolean).join("\n");
}

function buildReferenceAnalysisPrompt(attachedRoles = attachedImageRoles()) {
  return attachedRoles.length ? attachedRoles.map((role) => imageAnalysisText(role)).join("\n\n") : "No reference image analysis is available because no images are attached.";
}

function promptSection(title, body) {
  return ["", `${title}:`, body || "Not specified."];
}

function limitPrompt(text) {
  if (text.length <= PROMPT_CHAR_LIMIT) return text;
  return `${text.slice(0, PROMPT_CHAR_LIMIT - 180)}\n\n[Prompt trimmed to stay under ${PROMPT_CHAR_LIMIT} characters. Keep all reference roles and structured analysis priorities above.]`;
}

function buildPrompt() {
  const attachedRoles = attachedImageRoles();
  const roleLines = attachedRoles.length ? attachedRoles.map((role) => role.apiRole(role.imageNumber)).join("\n") : "No reference images are attached; use only the manually specified fields.";
  const sections = [
    "Create one high-fidelity photorealistic image from the attached references.",
    "",
    "Preset library selections:",
    state.selectedPresets.length ? state.selectedPresets.map((item) => `${item.category}: ${item.title}`).join("\n") : "No preset selected; use the manually specified fields.",
    "",
    "Reference image roles:",
    roleLines,
    "",
    "Reference image analysis:",
    buildReferenceAnalysisPrompt(attachedRoles),
    "",
    "Instagram realism lock:",
    instagramRealismLock.join("\n"),
    ...promptSection("Subject identity", readField("identity")),
    ...promptSection("Body, pose, and gesture", readField("body"))
  ];

  if (state.images.outfit) {
    sections.push(...promptSection("Outfit reference and material detail", readField("outfit")));
  }

  if (state.images.scene) {
    sections.push("", "Scene reference isolation rule:", sceneReferenceIsolation.join("\n"), ...promptSection("Scene/environment reference notes", readField("scene")));
  }

  sections.push(
    ...promptSection("Camera and composition", `${readField("camera")} Aspect ratio ${state.ratio}. Target ${readField("resolution")} output.`),
    ...promptSection("Lighting and color", readField("lighting")),
    ...promptSection("Realism requirements", readField("realism")),
    ...promptSection("Negative constraints", readField("negative")),
    "",
    "Quality bar:",
    "The final image must look like a real Instagram photograph captured in the referenced environment. Preserve only the attached reference roles, match lighting and perspective for provided references, keep hands and anatomy natural, and avoid generated-image artifacts.",
    "",
    "Final use of analyzed references:",
    "Use the written Reference image analysis above as the concrete visual source of truth together with the uploaded images. If the analysis describes a visible detail, preserve it unless another higher-priority reference role forbids it. For the scene image, use only the environment analysis and never copy people, outfits, actions, or identity from the scene."
  );

  return limitPrompt(sections.join("\n"));
}

function buildJson() {
  const model = readField("model");
  const prompt = buildPrompt();
  const attachedRoles = attachedImageRoles();
  const missingAnalysisSlots = attachedRoles.filter((role) => !role.image.analysis?.trim()).map((role) => role.id);
  const face = roleStructured("face");
  const body = roleStructured("body");
  const outfit = roleStructured("outfit");
  const scene = roleStructured("scene");

  return {
    model,
    model_alias: model === "gemini-3-pro-image" ? "Nano Banana Pro" : "Nano Banana 2",
    prompt_limit: { max_characters: PROMPT_CHAR_LIMIT, current_characters: prompt.length, within_limit: prompt.length <= PROMPT_CHAR_LIMIT },
    prompt,
    analysis_ready: attachedRoles.length > 0 && missingAnalysisSlots.length === 0,
    missing_analysis_slots: missingAnalysisSlots,
    compiled_reference_analysis_prompt: buildReferenceAnalysisPrompt(attachedRoles),
    analysis_usage_policy: "Use compiled_reference_analysis_prompt as concrete visual guidance in addition to the uploaded reference images and their role instructions.",
    references: Object.fromEntries(attachedRoles.map((role) => [role.id, {
      image_index: role.imageNumber,
      file_name: role.image.name,
      role_relation: role.apiRole(role.imageNumber),
      analysis_used_in_prompt: Boolean(role.image.analysis?.trim()),
      image_metadata: role.image.metadata,
      transfer_policy: referencePolicies[role.id],
      analysis: { description: role.image.analysis?.trim() || "AI visual analysis has not been completed for this uploaded image yet.", parts: roleStructured(role.id)?.parts || {} }
    }])),
    omitted_reference_slots: imageRoles.filter((role) => !state.images[role.id]).map((role) => role.id),
    subject: {
      identity: { instruction: readField("identity"), source: state.images.face ? "face reference" : null, analysis: face?.description || "", parts: face?.parts || {} },
      body: { instruction: readField("body"), source: state.images.body ? "body reference" : null, analysis: body?.description || "", parts: {
        overall_build: body?.parts.overall_build || "", proportions: body?.parts.proportions || "", shoulders: body?.parts.shoulders || "", torso: body?.parts.torso || "", waist_hips: body?.parts.waist_hips || "", arms_hands: body?.parts.arms_hands || "", legs: body?.parts.legs || "", posture_pose: body?.parts.posture_pose || "", silhouette: body?.parts.silhouette || "", framing: body?.parts.framing || ""
      } },
      outfit: { instruction: state.images.outfit ? readField("outfit") : "No outfit reference uploaded.", source: state.images.outfit ? "outfit reference" : null, analysis: outfit?.description || "", parts: {
        top: outfit?.parts.top || "", bottom: outfit?.parts.bottom || "", outerwear: outfit?.parts.outerwear || "", footwear: outfit?.parts.footwear || "", bag: outfit?.parts.bag || "", jewelry_accessories: outfit?.parts.jewelry_accessories || "", belt: outfit?.parts.belt || "", hosiery_socks: outfit?.parts.hosiery_socks || "", hair_accessories: outfit?.parts.hair_accessories || "", colors_materials: outfit?.parts.colors_materials || "", fit_layers: outfit?.parts.fit_layers || "", logos_text: outfit?.parts.logos_text || "", missing_or_cropped: outfit?.parts.missing_or_cropped || ""
      } },
      scene_environment: { instruction: state.images.scene ? readField("scene") : "No scene reference uploaded.", source: state.images.scene ? "scene reference - environment only" : null, analysis: scene?.description || "", parts: {
        place_type: scene?.parts.place_type || "", layout_architecture: scene?.parts.layout_architecture || "", lighting: scene?.parts.lighting || "", color_temperature: scene?.parts.color_temperature || "", weather_atmosphere: scene?.parts.weather_atmosphere || "", depth_perspective: scene?.parts.depth_perspective || "", surfaces_materials: scene?.parts.surfaces_materials || "", reflections: scene?.parts.reflections || "", exclusions: scene?.parts.exclusions || "Do not copy people, pose, outfit, action, identity, text, logos, or foreground subject matter from the scene image."
      } }
    },
    output: { aspect_ratio: state.ratio, resolution: readField("resolution"), realism_mode: "photorealistic-natural" },
    camera_and_composition: readField("camera"),
    lighting_and_color: readField("lighting"),
    realism_requirements: readField("realism"),
    negative_constraints: readField("negative"),
    instagram_realism_lock: instagramRealismLock,
    scene_reference_isolation: state.images.scene ? sceneReferenceIsolation : null,
    selected_preset_library: state.selectedPresets,
    guide_compliance: { explicit_reference_roles: true, instagram_realism_lock: true, camera_lighting_format_controls: true, negative_constraints: true, identity_preservation: true, scene_environment_only: true }
  };
}

function updateOutput() {
  const json = JSON.stringify(buildJson(), null, 2);
  els.jsonOutput.textContent = json;
  renderHighlightedJson(json);
}

function renderHighlightedJson(json) {
  const analysisValues = attachedImageRoles().map((role) => role.image.analysis?.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!analysisValues.length) {
    els.jsonHighlighted.textContent = json;
    return;
  }
  let marked = json;
  analysisValues.forEach((analysis, index) => {
    marked = marked.split(JSON.stringify(analysis).slice(1, -1)).join(`__ANALYSIS_${index}__`);
  });
  let html = escapeHtml(marked);
  analysisValues.forEach((analysis, index) => {
    html = html.split(`__ANALYSIS_${index}__`).join(`<span class="analysis-highlight">${escapeHtml(JSON.stringify(analysis).slice(1, -1))}</span>`);
  });
  els.jsonHighlighted.innerHTML = html;
}

async function updateProviderStatus() {
  try {
    const response = await fetch(`${apiBase}/api/health`);
    const health = await response.json();
    els.providerStatus.textContent = `Vision provider: ${health.provider} / ${health.visionModel}`;
  } catch {
    els.providerStatus.textContent = "Vision provider: local server not running";
  }
}

async function analyzeImage(role, options = {}) {
  const image = state.images[role];
  if (!image || state.analysisInFlight[role] || (!options.force && image.analysis?.trim())) return;
  state.analysisInFlight[role] = true;
  state.analysisStatus[role] = "Analyzing...";
  renderDropzones();
  try {
    const response = await fetch(`${apiBase}/api/analyze-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, imageDataUrl: image.preview, metadata: image.metadata })
    });
    const payload = await response.json();
    if (!response.ok || payload.setup_required || payload.error) throw new Error(payload.error || "Vision analysis failed.");
    if (!payload.analysis?.trim()) throw new Error("Vision provider returned no analysis text. The JSON was not updated.");
    state.images[role].analysis = payload.analysis;
    state.images[role].structuredAnalysis = payload.structured_analysis || { description: payload.analysis, parts: {} };
    state.analysisStatus[role] = `AI analysis injected from ${payload.provider || "vision"} / ${payload.model || "model"} - ${image.metadata.summary}`;
  } catch (error) {
    state.analysisStatus[role] = error instanceof TypeError ? "Local vision server is not running. Run npm start, then try again." : `AI analysis failed: ${error.message}`;
  } finally {
    state.analysisInFlight[role] = false;
    renderDropzones();
    updateOutput();
  }
}

async function analyzeAllMissing() {
  const roles = imageRoles.map((role) => role.id).filter((role) => state.images[role] && !state.images[role].analysis?.trim());
  await Promise.all(roles.map((role) => analyzeImage(role)));
}

function handleUpload(event) {
  const file = event.target.files?.[0];
  const role = event.target.dataset.upload;
  if (!file || !role) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = String(reader.result);
    const [, base64 = ""] = dataUrl.split(",");
    const metadata = await loadImageMetadata(dataUrl);
    state.images[role] = { name: file.name, mimeType: file.type || "image/jpeg", base64, preview: dataUrl, analysis: "", structuredAnalysis: null, metadata };
    state.analysisStatus[role] = "Uploaded - AI analysis queued";
    renderDropzones();
    updateOutput();
    if (state.autoAnalyze) analyzeImage(role);
  };
  reader.readAsDataURL(file);
}

function handleAnalysisInput(event) {
  const role = event.target.dataset.analysis;
  if (!role || !state.images[role]) return;
  state.images[role].analysis = event.target.value;
  state.images[role].structuredAnalysis = { description: event.target.value, parts: state.images[role].structuredAnalysis?.parts || {} };
  updateOutput();
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeTextarea(value) {
  return escapeHtml(value);
}

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    state.ratio = button.dataset.ratio;
    document.querySelectorAll(".segment").forEach((segment) => segment.classList.toggle("active", segment === button));
    updateOutput();
  });
});

document.querySelectorAll(".library-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeLibrary = button.dataset.library;
    document.querySelectorAll(".library-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderPresetGrid();
  });
});

els.clearPresets.addEventListener("click", () => {
  state.selectedPresets = [];
  renderPresetGrid();
  updateOutput();
});

els.analyzeAll.addEventListener("click", analyzeAllMissing);

fields.forEach((id) => {
  const field = document.getElementById(id);
  if (!field) return;
  field.addEventListener("input", updateOutput);
  field.addEventListener("change", updateOutput);
});

els.copyJson.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.jsonOutput.textContent);
    els.copyStatus.textContent = "Copied JSON";
  } catch {
    els.jsonOutput.focus();
    document.execCommand("selectAll");
    els.copyStatus.textContent = "Select the JSON and copy";
  }
});

const schemaState = {
  activeSchemaTab: "meta",
  quality: "ultra_photorealistic",
  safety_filter: "block_some",
  steps: 40,
  guidance_scale: 7.5,
  seed: null,
  scene_time: "",
  scene_weather: "",
  lighting_type: "",
  lighting_direction: "",
  camera_model: "",
  lens: "",
  aperture: "",
  shutter_speed: "",
  iso: "",
  film_stock: "",
  framing: "",
  angle: "",
  focus_point: "",
  expression: "neutral",
  gender: "",
  age: "",
  hair_style: "",
  hair_color: "",
  style_medium: "",
  style_aesthetics: [],
  artist_reference: "",
  text_enabled: false,
  text_content: "",
  text_placement: "",
  text_font_style: "",
  text_color: "",
  magic_prompt_enhancer: true,
  hdr_mode: true
};

const aestheticOptions = [
  "cyberpunk", "steampunk", "vaporwave", "synthwave", "noir",
  "minimalist", "maximalist", "gothic", "baroque", "retro_80s",
  "vintage_50s", "futuristic", "post_apocalyptic", "ethereal", "dreamcore", "weirdcore"
];

function renderAestheticChips() {
  const container = document.getElementById("sc_aesthetics");
  if (!container) return;
  container.innerHTML = aestheticOptions.map((a) => {
    const active = schemaState.style_aesthetics.includes(a);
    return `<button class="chip ${active ? "active" : ""}" type="button" data-aesthetic="${a}">${a.replace(/_/g, " ")}</button>`;
  }).join("");
  container.querySelectorAll("[data-aesthetic]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.aesthetic;
      const idx = schemaState.style_aesthetics.indexOf(val);
      if (idx >= 0) schemaState.style_aesthetics.splice(idx, 1);
      else schemaState.style_aesthetics.push(val);
      renderAestheticChips();
      updateOutput();
    });
  });
}

// Schema tab switching
document.querySelectorAll("[data-stab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    schemaState.activeSchemaTab = tab.dataset.stab;
    document.querySelectorAll("[data-stab]").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll("[data-spanel]").forEach((p) => p.classList.toggle("active", p.dataset.spanel === schemaState.activeSchemaTab));
  });
});

// Schema select / input field bindings
const schemaFieldMap = {
  sc_quality:       (v) => { schemaState.quality = v; },
  sc_safety:        (v) => { schemaState.safety_filter = v; },
  sc_steps:         (v) => { schemaState.steps = parseInt(v, 10) || 40; },
  sc_guidance:      (v) => { schemaState.guidance_scale = parseFloat(v) || 7.5; },
  sc_seed:          (v) => { schemaState.seed = v ? parseInt(v, 10) : null; },
  sc_time:          (v) => { schemaState.scene_time = v; },
  sc_weather:       (v) => { schemaState.scene_weather = v; },
  sc_light_type:    (v) => { schemaState.lighting_type = v; },
  sc_light_dir:     (v) => { schemaState.lighting_direction = v; },
  sc_camera_model:  (v) => { schemaState.camera_model = v; },
  sc_lens:          (v) => { schemaState.lens = v; },
  sc_aperture:      (v) => { schemaState.aperture = v; },
  sc_shutter:       (v) => { schemaState.shutter_speed = v; },
  sc_iso:           (v) => { schemaState.iso = v; },
  sc_film:          (v) => { schemaState.film_stock = v; },
  sc_framing:       (v) => { schemaState.framing = v; },
  sc_angle:         (v) => { schemaState.angle = v; },
  sc_focus:         (v) => { schemaState.focus_point = v; },
  sc_expression:    (v) => { schemaState.expression = v; },
  sc_gender:        (v) => { schemaState.gender = v; },
  sc_age:           (v) => { schemaState.age = v; },
  sc_hair_style:    (v) => { schemaState.hair_style = v; },
  sc_hair_color:    (v) => { schemaState.hair_color = v; },
  sc_medium:        (v) => { schemaState.style_medium = v; },
  sc_artist:        (v) => { schemaState.artist_reference = v; },
  sc_text_content:  (v) => { schemaState.text_content = v; },
  sc_text_color:    (v) => { schemaState.text_color = v; },
  sc_text_placement:(v) => { schemaState.text_placement = v; },
  sc_text_font:     (v) => { schemaState.text_font_style = v; }
};

Object.entries(schemaFieldMap).forEach(([id, setter]) => {
  const el = document.getElementById(id);
  if (!el) return;
  const handler = () => { setter(el.value); updateOutput(); };
  el.addEventListener("input", handler);
  el.addEventListener("change", handler);
});

document.getElementById("sc_text_enabled")?.addEventListener("change", (e) => {
  schemaState.text_enabled = e.target.checked;
  const fields = document.getElementById("sc_text_fields");
  if (fields) fields.style.display = e.target.checked ? "" : "none";
  updateOutput();
});

document.getElementById("sc_magic_prompt")?.addEventListener("change", (e) => {
  schemaState.magic_prompt_enhancer = e.target.checked;
  updateOutput();
});

document.getElementById("sc_hdr")?.addEventListener("change", (e) => {
  schemaState.hdr_mode = e.target.checked;
  updateOutput();
});

// Hide text fields initially (text rendering is off by default)
const initialTextFields = document.getElementById("sc_text_fields");
if (initialTextFields) initialTextFields.style.display = "none";

renderAestheticChips();

renderDropzones();
renderPresetGrid();
updateOutput();
updateProviderStatus();

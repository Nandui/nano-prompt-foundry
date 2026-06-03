(function () {

  // ── Helpers ────────────────────────────────────────────────────

  function getAttachedRoles() {
    return imageRoles
      .filter((role) => state.images[role.id])
      .map((role, index) => ({ ...role, imageNumber: index + 1, image: state.images[role.id] }));
  }

  function structuredRole(roleId) {
    const image = state.images[roleId];
    if (!image) return null;
    const s = image.structuredAnalysis || {};
    const parts = Object.fromEntries(
      Object.entries(s.parts || {}).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v || ""])
    );
    return { description: s.description || image.analysis?.trim() || "", parts };
  }

  function partText(structured, key, fallback = "") {
    return structured?.parts?.[key] || fallback;
  }

  function presetGuidanceFor(fieldId) {
    return state.selectedPresets.map((p) => p.prompt_effect?.[fieldId]).filter(Boolean);
  }

  function selectedPresetSummary() {
    return state.selectedPresets.map(({ category, id, title }) => ({ category, id, title }));
  }

  // Returns just the instruction string when no preset guidance;
  // returns { instruction, presets } when presets contributed to this field.
  function fieldValue(id) {
    const guidance = presetGuidanceFor(id);
    const instruction = readField(id);
    return guidance.length ? { instruction, presets: guidance } : instruction;
  }

  // Returns just the 1-based image index number for a role.
  function imageRef(roleId) {
    const r = getAttachedRoles().find((role) => role.id === roleId);
    return r ? r.imageNumber : null;
  }

  // Returns analysis with only non-empty parts; null when there's nothing.
  function compactAnalysis(structured) {
    if (!structured) return null;
    const parts = Object.fromEntries(
      Object.entries(structured.parts).filter(([, v]) => v && v.trim())
    );
    const result = {};
    if (structured.description) result.description = structured.description;
    if (Object.keys(parts).length) result.parts = parts;
    return Object.keys(result).length ? result : null;
  }

  // ── buildJson override ─────────────────────────────────────────

  buildJson = function buildNestedPromptJson() {
    const attachedRoles = getAttachedRoles();
    const face   = structuredRole("face");
    const body   = structuredRole("body");
    const outfit = structuredRole("outfit");
    const scene  = structuredRole("scene");

    // ── Schema-driven parameters ───────────────────────────────

    const meta = {
      aspect_ratio:   state.ratio,
      quality:        schemaState.quality,
      safety_filter:  schemaState.safety_filter,
      steps:          schemaState.steps,
      guidance_scale: schemaState.guidance_scale,
      ...(schemaState.seed !== null ? { seed: schemaState.seed } : {})
    };

    const technical = {};
    if (schemaState.camera_model)  technical.camera_model  = schemaState.camera_model;
    if (schemaState.lens)          technical.lens          = schemaState.lens;
    if (schemaState.aperture)      technical.aperture      = schemaState.aperture;
    if (schemaState.shutter_speed) technical.shutter_speed = schemaState.shutter_speed;
    if (schemaState.iso)           technical.iso           = schemaState.iso;
    if (schemaState.film_stock)    technical.film_stock    = schemaState.film_stock;

    const compositionParams = {};
    if (schemaState.framing)     compositionParams.framing     = schemaState.framing;
    if (schemaState.angle)       compositionParams.angle       = schemaState.angle;
    if (schemaState.focus_point) compositionParams.focus_point = schemaState.focus_point;

    const sceneLighting = {};
    if (schemaState.lighting_type)      sceneLighting.type      = schemaState.lighting_type;
    if (schemaState.lighting_direction) sceneLighting.direction = schemaState.lighting_direction;

    const demographics = {};
    if (schemaState.gender) demographics.gender = schemaState.gender;
    if (schemaState.age)    demographics.age    = schemaState.age;
    demographics.expression = schemaState.expression || "neutral";

    const hair = {};
    if (schemaState.hair_style) hair.style = schemaState.hair_style;
    if (schemaState.hair_color) hair.color = schemaState.hair_color;

    const style_modifiers = {};
    if (schemaState.style_medium)            style_modifiers.medium    = schemaState.style_medium;
    if (schemaState.style_aesthetics.length) style_modifiers.aesthetic = [...schemaState.style_aesthetics];
    if (schemaState.artist_reference)        style_modifiers.artist    = schemaState.artist_reference;

    const negativeText = readField("negative");
    const advanced = {
      magic_prompt_enhancer: schemaState.magic_prompt_enhancer,
      hdr_mode:              schemaState.hdr_mode,
      ...(negativeText ? { negative_prompt: negativeText } : {})
    };

    // ── Compact analyses ───────────────────────────────────────

    const faceAnalysis   = compactAnalysis(face);
    const bodyAnalysis   = compactAnalysis(body);
    const outfitAnalysis = compactAnalysis(outfit);
    const sceneAnalysis  = compactAnalysis(scene);
    const bodyPose       = body ? partText(body, "posture_pose", "") : "";

    // ── Output ─────────────────────────────────────────────────

    return {
      meta,
      model: readField("model"),

      subject: {
        identity_token: "Character_Main",
        demographics,
        ...(Object.keys(hair).length ? { hair } : {}),

        face: {
          ...(state.images.face ? { image: imageRef("face") } : {}),
          instruction: fieldValue("identity"),
          ...(faceAnalysis ? { analysis: faceAnalysis } : {})
        },

        body: {
          ...(state.images.body ? { image: imageRef("body") } : {}),
          instruction: fieldValue("body"),
          ...(bodyAnalysis ? { analysis: bodyAnalysis } : {})
        },

        wardrobe: {
          ...(state.images.outfit ? { image: imageRef("outfit") } : {}),
          instruction: fieldValue("outfit"),
          ...(outfitAnalysis ? { analysis: outfitAnalysis } : {})
        }
      },

      scene: {
        ...(schemaState.scene_time    ? { time: schemaState.scene_time }                    : {}),
        ...(schemaState.scene_weather ? { weather: schemaState.scene_weather }              : {}),
        ...(Object.keys(sceneLighting).length ? { lighting_parameters: sceneLighting }     : {}),
        ...(state.images.scene        ? { image: imageRef("scene") }                       : {}),
        instruction: fieldValue("scene"),
        ...(sceneAnalysis             ? { analysis: sceneAnalysis }                        : {}),
        ...(state.images.scene
          ? { isolation: "Use environment, lighting, surfaces, and atmosphere only. Do not copy people, pose, outfit, identity, text, or logos." }
          : {})
      },

      composition: {
        ...compositionParams,
        camera: fieldValue("camera"),
        format: `${state.ratio} output`,
        ...(bodyPose ? { pose: bodyPose } : {})
      },

      ...(Object.keys(technical).length ? { technical } : {}),

      ...(schemaState.text_enabled ? {
        text_rendering: {
          enabled: true,
          content: schemaState.text_content || "",
          ...(schemaState.text_placement  ? { placement:  schemaState.text_placement  } : {}),
          ...(schemaState.text_font_style ? { font_style: schemaState.text_font_style } : {}),
          ...(schemaState.text_color      ? { color:      schemaState.text_color      } : {})
        }
      } : {}),

      ...(Object.keys(style_modifiers).length ? { style_modifiers } : {}),

      lighting: fieldValue("lighting"),
      realism:  fieldValue("realism"),
      advanced,

      ...(state.selectedPresets.length ? { presets: selectedPresetSummary() } : {})
    };
  };

  // ── Trimming helpers ───────────────────────────────────────────

  function truncateLongStrings(node, maxLen) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (Array.isArray(val)) {
        val.forEach((item) => { if (item && typeof item === "object") truncateLongStrings(item, maxLen); });
      } else if (typeof val === "string" && val.length > maxLen) {
        node[key] = val.slice(0, maxLen) + "…";
      } else if (val && typeof val === "object") {
        truncateLongStrings(val, maxLen);
      }
    }
  }

  function trimToLimit(obj) {
    let json = JSON.stringify(obj, null, 2);
    if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: false };

    const o = JSON.parse(json);

    // Rounds 1–4 — progressively shorten long analysis strings
    for (const maxLen of [800, 400, 200, 100]) {
      truncateLongStrings(o, maxLen);
      json = JSON.stringify(o, null, 2);
      if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: true };
    }

    // Round 5 — drop full analysis descriptions, keep parts only
    for (const roleKey of ["face", "body", "wardrobe"]) {
      if (o.subject?.[roleKey]?.analysis?.description) {
        delete o.subject[roleKey].analysis.description;
      }
    }
    if (o.scene?.analysis?.description) delete o.scene.analysis.description;
    json = JSON.stringify(o, null, 2);
    if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: true };

    // Round 6 — compact serialisation (saves ~20 %)
    json = JSON.stringify(o);
    if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: true };

    // Round 7 — hard slice (last resort)
    return { json: json.slice(0, PROMPT_CHAR_LIMIT), trimmed: true };
  }

  // ── updateOutput override ──────────────────────────────────────

  updateOutput = function updateNestedPromptOutput() {
    const { json, trimmed } = trimToLimit(buildJson());
    const status = document.getElementById("copyStatus");
    document.getElementById("jsonOutput").textContent = json;
    if (typeof renderHighlightedJson === "function") {
      renderHighlightedJson(json);
    } else {
      document.getElementById("jsonHighlighted").textContent = json;
    }
    if (status) {
      status.textContent = trimmed
        ? `Trimmed — ${json.length.toLocaleString()} / ${PROMPT_CHAR_LIMIT.toLocaleString()} chars`
        : `Ready — ${json.length.toLocaleString()} / ${PROMPT_CHAR_LIMIT.toLocaleString()} chars`;
    }
  };

  updateOutput();
})();

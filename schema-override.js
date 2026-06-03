(function () {
  function getAttachedRoles() {
    return imageRoles
      .filter((role) => state.images[role.id])
      .map((role, index) => ({
        ...role,
        imageNumber: index + 1,
        image: state.images[role.id]
      }));
  }

  function cleanParts(parts = {}) {
    return Object.fromEntries(
      Object.entries(parts).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value || ""])
    );
  }

  function structuredRole(roleId) {
    const image = state.images[roleId];
    if (!image) {
      return null;
    }
    const structured = image.structuredAnalysis || {};
    return {
      description: structured.description || image.analysis?.trim() || "",
      parts: cleanParts(structured.parts || {})
    };
  }

  function referenceSource(roleId, fallback) {
    const attachedRole = getAttachedRoles().find((role) => role.id === roleId);
    if (!attachedRole) {
      return { source: fallback, reference_image: null };
    }

    return {
      source: `${attachedRole.title.toLowerCase()} reference image`,
      reference_image: {
        image_index: attachedRole.imageNumber,
        file_name: attachedRole.image.name,
        role_relation: attachedRole.apiRole(attachedRole.imageNumber),
        metadata: attachedRole.image.metadata,
        analysis_ready: Boolean(attachedRole.image.analysis?.trim())
      }
    };
  }

  function referenceAnalysis(roleId) {
    const structured = structuredRole(roleId);
    if (!structured) {
      return null;
    }
    return {
      description: structured.description,
      parts: structured.parts
    };
  }

  function partText(structured, key, fallback = "") {
    return structured?.parts?.[key] || fallback;
  }

  function nonEmptyList(values) {
    return values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
  }

  function presetGuidanceFor(fieldId) {
    return state.selectedPresets.map((preset) => preset.prompt_effect?.[fieldId]).filter(Boolean);
  }

  function selectedPresetSummary() {
    return state.selectedPresets.map(({ category, id, title }) => ({ category, id, title }));
  }

  function fieldBrief(id) {
    return {
      instruction: readField(id),
      library_guidance: presetGuidanceFor(id)
    };
  }

  function sceneIsolationRules() {
    return typeof sceneReferenceIsolation !== "undefined"
      ? sceneReferenceIsolation
      : [
          "The scene reference image is background/environment data only.",
          "Use only the actual place, lighting, perspective, surfaces, reflections, and atmosphere.",
          "Do not copy people, pose, outfit, face, body, readable text, logos, or foreground subject matter."
        ];
  }

  buildJson = function buildNestedPromptJson() {
    const model = readField("model");
    const attachedRoles = getAttachedRoles();
    const missingAnalysisSlots = attachedRoles
      .filter((role) => !role.image.analysis?.trim())
      .map((role) => role.id);
    const face = structuredRole("face");
    const body = structuredRole("body");
    const outfit = structuredRole("outfit");
    const scene = structuredRole("scene");

    // ── Schema-driven sections ──────────────────────────────────────

    const meta = {
      aspect_ratio: state.ratio,
      quality: schemaState.quality,
      safety_filter: schemaState.safety_filter,
      steps: schemaState.steps,
      guidance_scale: schemaState.guidance_scale,
      ...(schemaState.seed !== null ? { seed: schemaState.seed } : {})
    };

    const technical = {};
    if (schemaState.camera_model) technical.camera_model = schemaState.camera_model;
    if (schemaState.lens) technical.lens = schemaState.lens;
    if (schemaState.aperture) technical.aperture = schemaState.aperture;
    if (schemaState.shutter_speed) technical.shutter_speed = schemaState.shutter_speed;
    if (schemaState.iso) technical.iso = schemaState.iso;
    if (schemaState.film_stock) technical.film_stock = schemaState.film_stock;

    const compositionSchema = {};
    if (schemaState.framing) compositionSchema.framing = schemaState.framing;
    if (schemaState.angle) compositionSchema.angle = schemaState.angle;
    if (schemaState.focus_point) compositionSchema.focus_point = schemaState.focus_point;

    const sceneLighting = {};
    if (schemaState.lighting_type) sceneLighting.type = schemaState.lighting_type;
    if (schemaState.lighting_direction) sceneLighting.direction = schemaState.lighting_direction;

    const text_rendering = schemaState.text_enabled
      ? {
          enabled: true,
          text_content: schemaState.text_content || "",
          ...(schemaState.text_placement ? { placement: schemaState.text_placement } : {}),
          ...(schemaState.text_font_style ? { font_style: schemaState.text_font_style } : {}),
          ...(schemaState.text_color ? { color: schemaState.text_color } : {})
        }
      : { enabled: false };

    const style_modifiers = {};
    if (schemaState.style_medium) style_modifiers.medium = schemaState.style_medium;
    if (schemaState.style_aesthetics.length) style_modifiers.aesthetic = [...schemaState.style_aesthetics];
    if (schemaState.artist_reference) style_modifiers.artist_reference = [schemaState.artist_reference];

    const advanced = {
      magic_prompt_enhancer: schemaState.magic_prompt_enhancer,
      hdr_mode: schemaState.hdr_mode,
      negative_prompt: [readField("negative")].filter(Boolean)
    };

    const demographics = {
      ...(schemaState.gender ? { gender: schemaState.gender } : {}),
      ...(schemaState.age ? { age: schemaState.age } : { age: "preserve apparent age from references" }),
      ethnicity: "not inferred unless written by user",
      expression: schemaState.expression || "neutral"
    };

    const hair = {};
    if (schemaState.hair_style) hair.style = schemaState.hair_style;
    if (schemaState.hair_color) hair.color = schemaState.hair_color;

    // ────────────────────────────────────────────────────────────────

    return {
      meta,
      model,
      model_alias: model === "gemini-3-pro-image" ? "Nano Banana Pro" : "Nano Banana 2",
      image_reference_status: {
        attached_roles: attachedRoles.map((role) => role.id),
        missing_analysis_slots: missingAnalysisSlots
      },
      subject: {
        identity_token: "Character_Main",
        reference_policy: "face=identity, body=proportions/pose, outfit=wardrobe, scene=environment only",
        demographics,
        ...(Object.keys(hair).length ? { hair } : {}),
        face: {
          ...referenceSource("face", "manual identity instruction"),
          instruction: fieldBrief("identity"),
          reference_analysis: referenceAnalysis("face"),
          shape: partText(face, "face_shape", "preserve face-reference shape"),
          eyes: {
            description: partText(face, "eyes_brows", "preserve eye shape, brows, gaze"),
            details: "natural catchlights, real eyelid folds"
          },
          eyebrows: {
            description: partText(face, "eyes_brows", "preserve brow shape")
          },
          nose: partText(face, "nose", "preserve visible nose shape"),
          lips: partText(face, "lips", "preserve visible lip shape and texture"),
          hair: {
            description: partText(face, "hair", "preserve hair color, hairline, texture, length, style")
          },
          skin: {
            description: partText(face, "skin_texture", "pores, fine lines, under-eye texture, tiny blemishes, asymmetry"),
            realism_lock: "no airbrushing, no poreless/plastic skin, no face reshaping"
          },
          expression: partText(face, "expression", "natural reference-matching micro-expression"),
          makeup_and_accessories: {
            makeup: partText(face, "makeup", "only if visible"),
            jewelry_eyewear: partText(face, "jewelry_eyewear", "only if visible")
          },
          identity_anchors: partText(face, "identity_anchors", "preserve recognizable facial geometry"),
          do_not_transfer: "background, outfit, scene lighting"
        },
        body: {
          ...referenceSource("body", "manual body/pose instruction"),
          instruction: fieldBrief("body"),
          reference_analysis: referenceAnalysis("body"),
          build: partText(body, "overall_build", "preserve body-reference build if uploaded"),
          height_proportion: partText(body, "proportions", "preserve visible proportions"),
          shoulders: partText(body, "shoulders"),
          torso: partText(body, "torso"),
          waist_hips: partText(body, "waist_hips"),
          arms_hands: partText(body, "arms_hands"),
          legs: partText(body, "legs"),
          visible_features: partText(body, "silhouette", "natural silhouette, realistic skin/fabric contact"),
          pose_boundary: "body reference controls posture/silhouette only"
        },
        wardrobe: {
          ...referenceSource("outfit", "manual wardrobe instruction or selected outfit preset"),
          instruction: fieldBrief("outfit"),
          reference_analysis: state.images.outfit ? referenceAnalysis("outfit") : null,
          outfit_style: state.images.outfit
            ? outfit?.description || "recreate the uploaded outfit reference accurately"
            : "manual wardrobe only; no outfit reference image",
          layers: nonEmptyList([partText(outfit, "top"), partText(outfit, "bottom"), partText(outfit, "outerwear")]),
          garments: {
            top: partText(outfit, "top"),
            bottom: partText(outfit, "bottom"),
            outerwear: partText(outfit, "outerwear"),
            footwear: partText(outfit, "footwear")
          },
          accessories: {
            bag: partText(outfit, "bag"),
            jewelry_accessories: partText(outfit, "jewelry_accessories"),
            belt: partText(outfit, "belt"),
            hosiery_socks: partText(outfit, "hosiery_socks"),
            hair_accessories: partText(outfit, "hair_accessories")
          },
          materials_and_fit: {
            colors_materials: partText(outfit, "colors_materials", "real fabric texture, seams, weight, wrinkles, fit"),
            fit_layers: partText(outfit, "fit_layers"),
            logos_text: partText(outfit, "logos_text", "avoid readable brand text unless intended"),
            missing_or_cropped: partText(outfit, "missing_or_cropped")
          }
        }
      },
      scene: {
        ...(schemaState.scene_time ? { time: schemaState.scene_time } : {}),
        ...(schemaState.scene_weather ? { weather: schemaState.scene_weather } : {}),
        ...(Object.keys(sceneLighting).length ? { lighting_parameters: sceneLighting } : {}),
        ...referenceSource("scene", "manual scene instruction or selected scene preset"),
        instruction: fieldBrief("scene"),
        reference_analysis: state.images.scene ? referenceAnalysis("scene") : null,
        environment: state.images.scene
          ? partText(scene, "place_type", scene?.description || readField("scene"))
          : readField("scene"),
        foreground_elements: [],
        background_elements: nonEmptyList([partText(scene, "layout_architecture"), partText(scene, "depth_perspective")]),
        textures_and_surfaces: {
          ground_and_surfaces: partText(scene, "surfaces_materials", "real materials, contact shadows, surface texture"),
          reflections: partText(scene, "reflections"),
          walls_or_architecture: partText(scene, "layout_architecture")
        },
        lighting_from_scene: {
          direction_and_quality: partText(scene, "lighting"),
          color_temperature: partText(scene, "color_temperature"),
          weather_atmosphere: partText(scene, "weather_atmosphere")
        },
        scene_reference_isolation: state.images.scene ? sceneIsolationRules() : null,
        exclusions: state.images.scene
          ? partText(
              scene,
              "exclusions",
              "Use only place, lighting, perspective, surfaces, reflections, atmosphere. Do not copy people, pose, outfit, text, logos."
            )
          : "No scene reference image; use written scene/preset only."
      },
      composition: {
        ...(Object.keys(compositionSchema).length ? compositionSchema : {}),
        pose: {
          description: partText(body, "posture_pose", readField("body")),
          stance: partText(body, "silhouette", "natural creator stance, grounded weight"),
          hands: partText(body, "arms_hands", "accurate natural hands/fingers"),
          framing_notes: partText(body, "framing")
        },
        camera: {
          shot_type: "derive from camera instruction/preset",
          angle: readField("camera"),
          perspective: "real camera perspective",
          framing: `compose for ${state.ratio} social-photo output`
        },
        optics: {
          lens: "use camera preset or written lens",
          aperture: "natural depth of field",
          depth_of_field: "subject sharp, realistic falloff",
          artifacts: "mild sensor noise, compression, natural sharpening"
        }
      },
      ...(Object.keys(technical).length ? { technical } : {}),
      text_rendering,
      ...(Object.keys(style_modifiers).length ? { style_modifiers } : {}),
      lighting_and_atmosphere: {
        primary_light: {
          instruction: readField("lighting"),
          from_scene_reference: state.images.scene ? partText(scene, "lighting") : "",
          color_temperature: state.images.scene ? partText(scene, "color_temperature") : "match written lighting guidance"
        },
        accent_lights: presetGuidanceFor("lighting"),
        atmosphere: state.images.scene
          ? partText(scene, "weather_atmosphere", "preserve scene atmosphere only")
          : "written/preset atmosphere only",
        color_grading: "authentic Instagram color, natural skin tones, realistic dynamic range"
      },
      instagram_realism: {
        requirement: readField("realism"),
        lock: "real Instagram creator photo; pores, fine lines, blemishes, asymmetry, fabric texture, real shadows, mild noise/compression",
        anti_ai_finish: "no plastic skin, waxy highlights, airbrushing, perfect AI background, or generic model face"
      },
      advanced,
      technical_specifications: {
        output_format: "JSON prompt for image generation",
        aspect_ratio: state.ratio,
        resolution: readField("resolution"),
        style_preset: "Instagram-grade photorealistic social photography",
        color_grading: "natural creator-post color, realistic shadows/highlights/WB/compression",
        model_targets: ["Nano Banana Pro", "Nano Banana 2"],
        character_budget: `under ${PROMPT_CHAR_LIMIT} characters`
      },
      selected_preset_library: selectedPresetSummary(),
      reference_usage_rules: {
        uploaded_face: state.images.face
          ? "Use face image and face analysis for identity only."
          : "No face reference uploaded.",
        uploaded_body: state.images.body
          ? "Use body image and body analysis for build, proportions, pose, and silhouette only."
          : "No body reference uploaded.",
        uploaded_outfit: state.images.outfit
          ? "Use outfit image and outfit analysis for garments, materials, fit, and accessories only."
          : "No outfit reference uploaded; do not mention an outfit reference.",
        uploaded_scene: state.images.scene
          ? "Use scene image and scene analysis only for actual place, environment, lighting, perspective, surfaces, reflections, and atmosphere."
          : "No scene reference uploaded; do not mention a scene reference."
      }
    };
  };

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

    // Deep-clone so we don't mutate the live object
    const o = JSON.parse(json);

    // Round 1 — drop pure-documentation field (~400 chars)
    delete o.reference_usage_rules;
    json = JSON.stringify(o, null, 2);
    if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: true };

    // Rounds 2–5 — progressively shorten long strings
    for (const maxLen of [600, 300, 150, 80]) {
      truncateLongStrings(o, maxLen);
      json = JSON.stringify(o, null, 2);
      if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: true };
    }

    // Round 6 — compact serialisation (no whitespace saves ~20 %)
    json = JSON.stringify(o);
    if (json.length <= PROMPT_CHAR_LIMIT) return { json, trimmed: true };

    // Round 7 — hard slice (last resort; keeps valid-enough text)
    return { json: json.slice(0, PROMPT_CHAR_LIMIT), trimmed: true };
  }

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
        ? `Trimmed — ${json.length}/${PROMPT_CHAR_LIMIT} characters`
        : `Ready — ${json.length}/${PROMPT_CHAR_LIMIT} characters`;
    }
  };

  updateOutput();
})();

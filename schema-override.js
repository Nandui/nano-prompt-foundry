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

    return {
      model,
      model_alias: model === "gemini-3-pro-image" ? "Nano Banana Pro" : "Nano Banana 2",
      image_reference_status: {
        attached_roles: attachedRoles.map((role) => role.id),
        missing_analysis_slots: missingAnalysisSlots
      },
      subject: {
        identity_token: "Character_Main_Female",
        reference_policy: "face=identity, body=proportions/pose, outfit=wardrobe, scene=environment only",
        demographics: {
          gender: "female",
          age: "adult; preserve apparent age from references",
          ethnicity: "not inferred unless written by user"
        },
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
        ...referenceSource("scene", "manual scene instruction or selected scene preset"),
        instruction: fieldBrief("scene"),
        reference_analysis: state.images.scene ? referenceAnalysis("scene") : null,
        environment: state.images.scene
          ? partText(scene, "place_type", scene?.description || readField("scene"))
          : readField("scene"),
        time_of_day: "derive only from scene reference or written scene instruction",
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
      negative_prompt: {
        instruction: readField("negative"),
        anatomy: "extra/fused fingers, warped hands, distorted joints, impossible posture",
        identity: "identity drift, face reshaping, generic replacement face",
        rendering: "airbrushed/poreless/plastic skin, CGI sheen, fake bokeh",
        scene: "floating subject, mismatched shadows, copied scene people, unwanted text/logos/watermarks/UI"
      },
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

  updateOutput = function updateNestedPromptOutput() {
    let json = JSON.stringify(buildJson(), null, 2);
    const status = document.getElementById("copyStatus");
    document.getElementById("jsonOutput").textContent = json;
    if (typeof renderHighlightedJson === "function") {
      renderHighlightedJson(json);
    } else {
      document.getElementById("jsonHighlighted").textContent = json;
    }
    if (status) {
      status.textContent =
        json.length <= PROMPT_CHAR_LIMIT
          ? `Ready - ${json.length}/${PROMPT_CHAR_LIMIT} characters`
          : `Over limit - ${json.length}/${PROMPT_CHAR_LIMIT} characters`;
    }
  };

  updateOutput();
})();

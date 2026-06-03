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
    }),
    preset("pool-day", "Pool day", "poolside, swimwear, sun", {
      scene: "Residential or resort pool environment only: still or rippling water with caustic light patterns, pool edge, sun lounger or tile surface, warm concrete or stone.",
      camera: "Bright outdoor phone or camera vertical crop, subject at pool edge or waist-deep, strong top-down or eye-level angle, crisp saturated highlights.",
      lighting: "Harsh midday or afternoon sun, bright specular reflections on water surface, warm rim light from pool shimmer, believable sun-tanned skin exposure."
    }),
    preset("gym-selfie", "Gym mirror", "fitness, pump check", {
      scene: "Gym environment only: large mirror, weight racks or machines softly blurred, industrial ceiling lighting, clean gym floor, no identifiable people in background.",
      camera: "Front camera or phone main lens gym selfie, vertical crop, mid-torso to head or full body depending on outfit, subject sharp against gym mirror.",
      lighting: "Overhead gym LED or fluorescent, hard direct light on subject, slight mirror reflection, real skin texture and pump without beauty filter."
    }),
    preset("grwm", "GRWM", "vanity mirror, getting ready", {
      scene: "Vanity or bathroom environment only: makeup laid on counter, mirror frame visible, warm globe lights or LED strip, marble or wood surface, personal products softly visible.",
      camera: "Front camera or phone main lens, vertical crop, close-to-mid framing, face well-lit and centered, getting-ready energy.",
      lighting: "Warm vanity globe lights or ring light, even face illumination, catchlight in eyes, soft fill, no hard shadows from above."
    }),
    preset("brunch", "Sunday brunch", "café table, window light", {
      scene: "Brunch café or restaurant environment only: table with food or drinks, natural window light, bright airy interior, plants or neutral decor softly visible.",
      camera: "Phone snapshot portrait, vertical crop, seated subject with food in foreground or beside, medium framing, clean white balance.",
      lighting: "Bright natural side window light, airy shadows, warm neutral color temperature, clean highlights on glassware, natural skin tone."
    }),
    preset("night-out", "Night out", "going out, bar, heels on", {
      scene: "Night venue or pre-night-out environment only: bar, hotel lobby, or lounge with warm practicals, bokeh background, ambient glow from screens or pendants.",
      camera: "Close-to-medium phone portrait, vertical 4:5 crop, candid or intentionally posed going-out energy, outfit clearly visible.",
      lighting: "Warm practical light mixed with subtle flash fill, realistic specular on fabric and skin, night atmosphere with enough exposure to read outfit detail."
    }),
    preset("hotel-morning", "Hotel morning", "white linen, golden light", {
      scene: "Luxury hotel room environment only: white or cream bedding, stacked pillows, sheer curtains with morning light, neutral walls, no clutter.",
      camera: "Morning aesthetic portrait, vertical or close-to-square crop, subject relaxed on bed or near window, close-to-mid framing.",
      lighting: "Soft warm morning window light through sheer curtains, dreamy diffused quality, gentle fill, natural skin warmth without orange cast."
    }),
    preset("sunset-beach", "Sunset beach", "golden hour shoreline", {
      scene: "Beach shoreline at golden hour environment only: warm sand, calm waterline, low sun on horizon, hazy warm sky, minimal clutter.",
      body: "Relaxed beach pose facing or turned from the sun, natural weight on one leg, hair moved by gentle breeze, arms loose.",
      lighting: "Low golden sun backlight or side rim, warm skin highlight, soft shadow fill from sky bounce, golden haze, sand-reflected warm fill below."
    }),
    preset("festival-fit", "Festival fit", "outdoor event, crowd energy", {
      scene: "Outdoor festival or concert environment only: crowd softly blurred in background, stage lighting spill, dusty or grass ground, daytime or evening atmosphere.",
      body: "Festival energy pose: confident natural stance, slight movement, arms loose, candid celebratory feel without forced posing.",
      camera: "Candid festival shot, 35mm or phone feel, vertical crop, subject sharp against blurred festival crowd, real-world noise and color."
    }),
    preset("shopping", "Shopping day", "luxury retail, bags", {
      scene: "Luxury retail or shopping mall environment only: polished floors, boutique shelving softly visible, glass and chrome reflections, clean high-end interior.",
      body: "One or both hands on shopping bags, natural weight shift, relaxed confident stance with retail context.",
      camera: "Editorial shopping portrait, vertical crop, full or three-quarter body, 50mm feel, subject sharp against soft retail depth."
    }),
    preset("soft-morning", "Soft morning", "bedroom, cozy, first light", {
      scene: "Cozy bedroom environment only: soft bedding, warm neutral tones, curtains with morning light, personal items natural and lived-in, no showroom staging.",
      camera: "Intimate morning aesthetic, vertical crop, close-to-medium framing, soft natural perspective, no harsh angles.",
      lighting: "Diffused morning window light through curtains, gentle shadows, warm white balance, no artificial sources, quiet and intimate."
    }),
    preset("rooftop-moment", "Rooftop moment", "skyline, golden vibes", {
      scene: "Rooftop environment at golden or magic hour: soft city skyline visible, railing or ledge, warm ambient glow, atmospheric evening haze.",
      lighting: "Low warm side or back light from descending sun, city ambient fill, realistic skin warmth, soft contrast.",
      camera: "Social portrait on rooftop, vertical crop, medium framing, city skyline depth behind subject."
    }),
    preset("city-night-walk", "Night city walk", "street lights, urban energy", {
      scene: "Urban street at night environment only: streetlights, shopfront glow, wet pavement reflections optional, real city depth, indistinct pedestrians at distance.",
      body: "Candid mid-walk pose, natural stride, hands loose, coat or jacket in motion, eyes forward or glancing to side.",
      lighting: "Mixed streetlight and practical ambient, realistic skin under artificial light, mild grain, warm sodium or cool LED street spill."
    })
  ],
  scene: [
    preset("golden-balcony", "Golden balcony", "warm terrace", { scene: "Apartment or hotel balcony at golden hour with railing, city or garden depth, warm wall bounce, real floor texture, and subtle haze.", lighting: "Low side sun, warm rim light, soft bounce shadows, natural skin warmth without orange overgrading." }),
    preset("clean-bedroom", "Clean bedroom", "window light", { scene: "Real clean bedroom with linens, wardrobe or mirror, subtle personal objects, realistic proportions, no showroom staging.", lighting: "Large window light, soft directional shadows, gentle ambient fill, natural color temperature." }),
    preset("rooftop-night", "Rooftop night", "city lights", { scene: "Urban rooftop at night with city lights, safety railing, concrete or tile surface, believable depth, and slight evening atmosphere.", lighting: "Mixed city ambient light, practical highlights, realistic low-light grain, controlled face visibility without fake studio light." }),
    preset("beach-walk", "Beach walk", "sand and shore", { scene: "Natural beach shoreline with textured sand, waterline, indistinct distant people if present, wind movement, and realistic horizon placement.", lighting: "Soft coastal light, reflective sand bounce, gentle highlights, realistic wind-driven hair and fabric shadows." }),
    preset("airport", "Airport travel", "terminal and luggage", { scene: "Airport terminal or travel corridor with luggage, polished floors, unreadable signage, glass, and realistic depth cues.", lighting: "Large indoor terminal light, reflective floor bounce, neutral white balance, realistic phone-camera sharpness." }),
    preset("cafe-window", "Cafe window", "table and street depth", { scene: "Cafe table by a window with coffee, glass reflections, street depth outside, wood or stone table texture, believable background blur.", lighting: "Soft window light, warm interior practicals, natural face shadows, realistic highlights on glassware." }),
    preset("luxury-hotel", "Luxury hotel", "marble lobby, gold fixtures", {
      scene: "5-star hotel lobby or hallway environment only: marble floors, grand columns, soft gold or brass fixtures, lush floral arrangements, high ceilings, no identifiable guests or staff.",
      lighting: "Warm hotel ambient with recessed ceiling and chandelier glow, polished floor reflections, even flattering exposure, no harsh shadows."
    }),
    preset("rooftop-pool", "Rooftop pool", "infinity edge, city vista", {
      scene: "Rooftop infinity pool environment only: still or lightly rippling water, infinity edge with city or ocean horizon, smooth poolside stone or tile, sun loungers, warm sky.",
      lighting: "Afternoon or golden hour pool light, caustic water reflections on subject and surroundings, strong warm rim from low sun, bright saturated exposure."
    }),
    preset("italian-street", "Italian street", "cobblestone, warm facades", {
      scene: "Italian or Mediterranean street environment only: cobblestone pavement, warm ochre or terracotta building facades, wooden shutters, flower boxes, narrow perspective depth.",
      lighting: "Warm afternoon direct sun with golden bounce off building walls, real shadow geometry on cobblestone, natural warm Mediterranean color temperature."
    }),
    preset("paris-cafe", "Paris café", "terrace, wicker chairs", {
      scene: "Parisian café terrace environment only: wicker chairs, small round marble tables, espresso cups, striped awning, classic boulevard depth behind, Haussmann architecture suggestion.",
      lighting: "Soft overcast or dappled outdoor Parisian light, neutral to slightly warm, soft shadows on wicker, airy and bright, accurate café color rendering."
    }),
    preset("santorini", "Santorini", "white walls, blue domes", {
      scene: "Santorini Greek island environment only: whitewashed walls and stairs, iconic blue-domed church or accent, vivid Aegean sea and sky, volcanic rock, bougainvillea optional.",
      lighting: "Bright Mediterranean sun, strong contrast, stark white-reflected fill light, vivid blues, warm skin against white architecture."
    }),
    preset("sunset-ocean", "Sunset ocean", "open beach, horizon glow", {
      scene: "Open ocean beach at golden hour environment only: calm waterline, wide horizon, warm sky gradient, fine sand, minimal elements in frame.",
      lighting: "Low sun on horizon as backlight, warm orange and gold sky reflection on water and sand, strong rim light on subject, long shadow toward camera."
    }),
    preset("autumn-park", "Autumn park", "golden leaves, warm tones", {
      scene: "Autumn city park or leaf-covered pathway environment only: golden and orange fallen leaves, tree-lined path, wooden bench optional, no identifiable people.",
      lighting: "Soft autumn filtered sunlight through tree canopy, warm golden tones, dappled patches, soft contrast, real outdoor autumn color temperature."
    }),
    preset("pink-wall", "Pink wall", "vibrant exterior, street pop", {
      scene: "Vibrant pink or pastel-painted exterior wall environment only: smooth or lightly textured wall surface, ground pavement visible at bottom, real urban street scale.",
      lighting: "Direct or slightly overcast outdoor light, pink-reflected color fill from wall onto skin and clothing, clean and graphic, natural street shadows."
    }),
    preset("flower-market", "Flower market", "botanical, bloom wall", {
      scene: "Flower market or botanical garden environment only: abundant fresh flowers in rich varied colors, market stall shelving or bloom wall, green foliage throughout.",
      lighting: "Soft overcast or diffused outdoor light, even color rendering across flowers, natural green-and-white balance, gentle fill shadows."
    }),
    preset("luxury-bathroom", "Marble bathroom", "hotel spa, vanity", {
      scene: "Luxury hotel or spa bathroom environment only: marble surfaces and floors, vanity mirror, folded white towels, candles optional, glass shower or freestanding tub edge.",
      lighting: "Warm vanity and recessed bathroom lighting, soft even illumination, marble surface reflections, real skin texture without harsh highlights."
    }),
    preset("hotel-bed", "Hotel bed", "white linen, crisp sheets", {
      scene: "Luxury hotel bed environment only: crisp white or cream bedding, stacked pillows, neutral wall, soft morning or afternoon window light, no personal clutter.",
      lighting: "Soft diffused window light, clean white balance, natural soft shadows across bedding, clean skin highlight, airy calm atmosphere."
    }),
    preset("poolside", "Poolside resort", "private pool, cabana", {
      scene: "Private resort pool environment only: pool water edge with caustic pattern, smooth poolside tile or stone, sun lounger or draped towel, umbrella edge, warm resort atmosphere.",
      lighting: "Bright afternoon pool sun, warm direct light, water-reflected shimmer on surroundings and skin, saturated summer exposure."
    }),
    preset("concert", "Concert", "stage lights, crowd energy", {
      scene: "Live concert or festival stage environment only: colored stage lighting spill in warm and cool tones, crowd silhouettes softly blurred, smoke machine haze optional.",
      lighting: "Mixed stage spotlights with warm and cool gel colors, haze diffusion, backlight from stage, subject naturally visible within venue light. No studio look."
    }),
    preset("yacht", "Yacht deck", "ocean luxury, boat life", {
      scene: "Luxury yacht or boat deck environment only: open ocean horizon, white or teak deck, chrome railings, sea spray optional, afternoon or golden hour sky.",
      lighting: "Open ocean sun, bright reflected light from white deck and water, strong warm rim from sun angle, natural nautical exposure with wind and sky."
    }),
    preset("desert-road", "Desert road", "highway, vast sky", {
      scene: "Desert highway environment only: straight road vanishing point, cracked earth or red rock landscape, vast open sky with scattered clouds, warm dust atmosphere.",
      lighting: "Golden hour or harsh midday desert sun, strong directional warm light, deep real shadows, heat haze in distance, dramatic sky."
    }),
    preset("christmas-home", "Holiday home", "cozy, fairy lights", {
      scene: "Home holiday setting environment only: decorated Christmas tree with lights, warm wood floors or rug, fireplace optional, soft clutter of gifts, personal and lived-in.",
      lighting: "Warm fairy light and practical ambient glow, bokeh string lights in background, candlelight color temperature, cozy skin tone, no flash."
    }),
    preset("home-kitchen", "Home kitchen", "aesthetic, cooking, daylight", {
      scene: "Clean aesthetic home kitchen environment only: white or neutral countertop, fresh produce or coffee visible, quality appliances softly present, natural window light.",
      lighting: "Bright natural window light, warm under-cabinet accent, clean color rendering, soft lifestyle quality, no harsh overhead."
    })
  ],
  camera: [
    preset("phone-main", "Phone main lens", "social-photo sharpness", { camera: "Modern smartphone main camera look, vertical crop, natural wide-lens perspective without exaggeration, crisp subject detail, realistic computational HDR." }),
    preset("phone-tele", "Phone telephoto", "compressed portrait", { camera: "Smartphone telephoto portrait look, mild background compression, natural depth separation, sharp face and outfit, realistic social-media crop." }),
    preset("front-camera", "Front camera", "selfie perspective", { camera: "Smartphone front-camera selfie look, close-to-mid crop, slight wide-lens perspective, realistic face proportions without beautify filtering." }),
    preset("35mm", "35mm candid", "environmental frame", { camera: "35mm environmental portrait, eye-level framing, subject integrated with surroundings, natural perspective, mild background falloff." }),
    preset("50mm", "50mm portrait", "balanced realism", { camera: "50mm portrait lens feel, realistic perspective, controlled depth of field, clean subject separation, no artificial bokeh halos." }),
    preset("compact-flash", "Compact flash", "night snapshot", { camera: "Compact digital camera or disposable flash look, vertical snapshot crop, crisp flash-lit foreground, slight grain, real-world lens imperfections." }),
    preset("portrait-mode", "Portrait mode", "computational bokeh", { camera: "Smartphone portrait mode: subtle computational background blur with AI-edge separation, face-detection sharpening, clean soft bokeh, characteristic iPhone or Android processing artifacts on hair edges." }),
    preset("aesthetic-wide", "Lifestyle wide", "28mm, scene-in", { camera: "Slightly wide-angle 28–32mm feel, environmental lifestyle framing, subject integrated with scene context, no fisheye distortion, editorial open composition." }),
    preset("beauty-close", "Beauty close-up", "85mm, skin detail", { camera: "Tight beauty close-up, 85–105mm equivalent feel, face filling most of frame, eyelashes and skin texture tack-sharp, shallow depth of field, beauty editorial standard." }),
    preset("video-still", "Video frame grab", "16:9, spontaneous", { camera: "Video frame capture aesthetic, 16:9 crop, slight softness from codec compression, natural motion-ready spontaneous quality, feels like a pulled frame not a photo." }),
    preset("film-analog", "Analog film", "grain, warmth, imperfection", { camera: "35mm analog film scan: real grain structure, slight vignetting, gentle lens aberrations at edges, warm color shift, dust or scratch marks, authentic scanned film quality." }),
    preset("disposable", "Disposable cam", "flash, lo-fi, fun", { camera: "Single-use disposable camera aesthetic: hard direct flash, flat depth of field, slightly blown highlights on foreground, underexposed background, characteristic grainy shadows, fun candid lo-fi quality." })
  ],
  pose: [
    preset("contrapposto", "Contrapposto", "natural weight shift", { body: "Natural contrapposto stance with weight on one leg, subtle hip shift, relaxed shoulders, grounded feet, and hands visible." }),
    preset("walking", "Walking candid", "mid-stride", { body: "Natural mid-stride walking pose with believable balance, slight fabric motion, relaxed hands, and realistic foot placement." }),
    preset("seated", "Seated casual", "chair or curb", { body: "Casual seated pose with natural spine curve, knees and hands placed plausibly, no hidden or fused fingers, realistic clothing folds." }),
    preset("leaning", "Leaning pose", "wall or railing", { body: "Subject lightly leaning on a wall or railing with relaxed shoulders, believable contact point, natural arm angle, and grounded posture." }),
    preset("over-shoulder", "Over shoulder", "turning glance", { body: "Over-the-shoulder pose with torso rotation, natural neck angle, visible body silhouette, and believable shoulder alignment." }),
    preset("mirror-phone", "Phone-in-hand", "creator selfie", { body: "Casual phone-in-hand pose with visible grip, natural arm bend, realistic hand anatomy, and relaxed creator-post posture." }),
    preset("sitting-steps", "Sitting on steps", "staircase, editorial, casual", { body: "Seated on steps or low surface, knees at natural angles, elbows resting on knees or arms loose, slight forward lean, one foot higher than the other, confident and relaxed." }),
    preset("hair-flip", "Hair flip", "mid-motion, candid energy", { body: "Mid hair toss or flip, head tilted with hair catching movement, expression alive and natural, one hand just releasing hair or arms out, weight on back foot, genuine candid motion quality." }),
    preset("candid-laugh", "Candid laugh", "genuine joy, eyes crinkled", { body: "Caught mid-laugh, eyes naturally crinkled, slight head tilt, hand optionally raised toward mouth or chest, relaxed shoulders, natural weight shift, completely unposed feel." }),
    preset("looking-back", "Looking back", "walking away, glance", { body: "Walking away or standing with back to camera, rotating back to lens with a glance over the shoulder, torso three-quarters turned, weight naturally mid-step, confident relaxed posture." }),
    preset("car-lean", "Leaning on car", "luxury car, confident", { body: "Subject leaning lightly against a car door or hood, one shoulder or hip making contact, arm resting on car surface, weight shifted onto vehicle, casual confident stance." }),
    preset("bed-lounge", "Lounging on bed", "reclining, lifestyle", { body: "Reclined on bed, propped on elbows or lying with head on pillow, knees bent or legs extended, face naturally angled toward camera, relaxed and candid without stiffness." }),
    preset("phone-scroll", "Phone scroll", "looking at phone, candid", { body: "Looking down at phone in natural relaxed grip, weight on one hip, slight head tilt, candid distracted posture, realistic hand anatomy wrapping the device." }),
    preset("fixing-hair", "Fixing hair", "hands in hair, candid", { body: "One or both hands adjusting hair, head slightly tilted up or to the side, elbows raised naturally, soft unfocused expression as if checking in a mirror, relaxed and casual." }),
    preset("coffee-hands", "Coffee hands", "cup in hand, cozy prop", { body: "Both hands wrapped around a warm coffee cup or one hand holding it casually, gaze at the cup or glancing to the side, slightly hunched shoulders suggesting warmth, intimate lifestyle quality." }),
    preset("sunglasses-on", "Sunglasses on", "glamour, shades", { body: "Placing sunglasses on or posing with them on, slight chin tilt for glamour, direct or side gaze behind lenses, relaxed shoulder posture, effortlessly confident." }),
    preset("twirl", "Twirl", "spinning dress, motion", { body: "Mid-twirl spin, skirt or dress billowing outward with rotational motion, arms slightly lifted, joyful or carefree expression, feet on toes, natural motion blur on fabric edges." }),
    preset("crouching", "Street crouch", "editorial, low pose", { body: "Low editorial crouch on heels, elbows on knees or arms relaxed, direct camera gaze or looking to side, feet flat or on toes, intentional and stylish." }),
    preset("sitting-floor", "Floor pose", "ground level, relaxed", { body: "Sitting on the floor or ground, legs crossed or extended or tucked to one side, hands resting naturally on lap or ground, relaxed posture, candid lifestyle quality." }),
    preset("arms-up", "Arms overhead", "freedom, movement, dance", { body: "Arms raised overhead or to the sides with natural movement energy, head tilted back or to the side with joyful or carefree expression, body light on toes, genuine motion." })
  ],
  lighting: [
    preset("window", "Window light", "soft side light", { lighting: "Large soft window light from one side, natural shadow falloff, preserved skin texture, realistic room bounce and white balance." }),
    preset("golden", "Golden hour", "warm rim", { lighting: "Low warm sun with realistic rim light, soft bounce shadows, detailed skin texture, and restrained golden color grade." }),
    preset("overcast", "Overcast", "soft outdoor", { lighting: "Soft overcast outdoor light, broad shadowless illumination, muted highlights, realistic natural color and background depth." }),
    preset("direct-flash", "Direct flash", "night-out realism", { lighting: "On-camera direct flash with crisp foreground, realistic hard shadow, mild grain, natural specular highlights, no waxy skin." }),
    preset("neon", "Neon practicals", "night color", { lighting: "Mixed neon and practical ambient light, believable color cast, realistic low-light grain, face still readable, no synthetic glow." }),
    preset("bathroom", "Bathroom light", "mirror practicals", { lighting: "Bathroom overhead and mirror light, realistic skin texture, slight phone HDR, believable tile and glass reflections." }),
    preset("ring-light", "Ring light", "even face, circular catch", { lighting: "Direct ring light illumination with characteristic circular catchlight in eyes, even shadow-free facial lighting, smooth skin with natural texture preserved, warm or neutral color temperature typical of GRWM setup." }),
    preset("pool-caustics", "Pool caustics", "water shimmer, bright", { lighting: "Bright pool caustic light reflections, rippling light patterns on skin and surrounding surfaces, warm sun-over-water exposure, high-key bright pool day atmosphere with saturated color." }),
    preset("blue-hour", "Blue hour", "outdoor dusk, cool fill", { lighting: "Blue hour outdoor dusk light, deep blue sky as ambient fill, warm practical or streetlight as key, low contrast on skin, natural cool atmospheric tone, transitional day-to-night quality." }),
    preset("harsh-midday", "Midday sun", "hard fashion, editorial", { lighting: "Hard direct midday sun overhead, strong shadows under nose and chin, bleached highlights on shoulders and crown, high contrast, editorial fashion heat, sunlit outdoor energy." }),
    preset("fairy-lights", "Fairy lights", "warm bokeh, romantic", { lighting: "Background string lights as warm bokeh orbs, subject lit by a separate warm practical source, magical bokeh depth separation, warm white balance, cozy intimate atmosphere." }),
    preset("bar-club", "Bar / club", "mixed practicals, night", { lighting: "Night bar or club ambience: warm practical fixtures, neon accent or colored gel spill, slight atmospheric haze, skin visible but moodily lit, night photography with real contrast." }),
    preset("bedroom-morning", "Bedroom morning", "diffused, waking-up soft", { lighting: "Soft diffused morning light filtering through curtains or blinds, gentle shadows across bedding and face, warm neutral white balance, no artificial light contamination, intimate and quiet." }),
    preset("sunset-rim", "Sunset rim", "backlit golden halo", { lighting: "Strong low-sun rim or backlight creating a golden halo on hair and shoulders, face in gentle shadow with sky bounce fill, warm over-exposed background, dramatic silhouette quality." }),
    preset("dappled-shade", "Dappled shade", "tree canopy, organic", { lighting: "Natural dappled light through tree leaves or lattice, organic shadow pattern on subject and background, warm filtered sunlight, green ambient bounce, natural outdoor softness." }),
    preset("candle-glow", "Candle glow", "amber warmth, intimate", { lighting: "Candlelight as key source, extremely warm amber glow with natural uneven flickering quality, deep shadows on far side of face, visible grain from low light, intimate restaurant or home atmosphere." })
  ],
  realism: [
    preset("no-ai-skin", "Natural skin", "pores and texture", { realism: "Emphasize normal skin texture: pores, fine lines, tiny blemishes, under-eye texture, body texture, facial asymmetry. No poreless or plastic skin." }),
    preset("phone-post", "Phone post", "creator upload", { realism: "Feels like a real Instagram upload from a phone: mild compression, natural sharpening, tiny exposure imperfections, realistic HDR, no generated-image cleanliness." }),
    preset("fabric-detail", "Fabric detail", "seams and folds", { realism: "Clothing must show fabric weave, seams, hems, wrinkles, stretch, weight, stitching, and material behavior without plastic smoothness." }),
    preset("hands-lock", "Hands lock", "anatomy guard", { negative: "Avoid extra fingers, fused fingers, missing knuckles, distorted nails, melted jewelry, broken wrists, impossible hand grips, and hidden anatomy shortcuts." }),
    preset("background-real", "Real background", "not AI-clean", { realism: "Background should have ordinary imperfections, real edges, subtle clutter if appropriate, correct reflections, contact shadows, and believable depth." }),
    preset("anti-retouch", "Anti-retouch", "no airbrush", { negative: "No airbrushed face, no waxy highlights, no face reshaping, no plastic body texture, no AI glamour filter, no overly clean studio-perfect finish." })
  ],
  vibe: [
    preset("clean-girl", "Clean girl", "no-makeup makeup, dewy", {
      realism: "Clean girl aesthetic: dewy natural skin with visible pores, no-makeup makeup look, no smoothing or poreless filter, real texture on skin and lips, effortlessly understated.",
      camera: "Clean natural light, close-to-medium framing, simple uncluttered composition, soft neutral tones throughout.",
      lighting: "Bright diffused natural or window light, airy clean shadows, dewy skin highlights, bright whites, fresh and alive."
    }),
    preset("moody-edit", "Moody editorial", "dark, high contrast, fashion", {
      lighting: "Low-key moody lighting, deep shadows, single directional key light, high contrast, underexposed background, editorial fashion atmosphere.",
      camera: "35mm or 50mm editorial framing, intentional strong composition, slight shadow presence, cinematic vertical crop.",
      realism: "High-fashion editorial quality: sharp detail on subject against intentional deep shadow, textured fabric and real skin but controlled aesthetic. No flat or even lighting."
    }),
    preset("warm-aesthetic", "Warm aesthetic", "golden tones, cozy, honey", {
      lighting: "Warm golden tone throughout, soft natural or practical light, warm amber-touched skin rendering, honey color grade, cozy and inviting quality.",
      realism: "Warm Instagram aesthetic: slight soft grain, warm color tone overall, real skin texture with golden glow, authentic feel of a warm late afternoon."
    }),
    preset("y2k", "Y2K", "2000s nostalgia, glossy, digital", {
      camera: "Early 2000s digital compact camera aesthetic: slight overexposure, blown highlights, warm digital color processing, characteristic era lens look.",
      lighting: "Harsh direct flash or overexposed bright light, characteristic early 2000s blown-out skin, high-key glossy finish.",
      realism: "Y2K photo quality: slight digital compression, era-specific color rendering, glossy magazine meets early digicam, characteristic noise pattern."
    }),
    preset("old-money", "Old money", "quiet luxury, tasteful, restrained", {
      realism: "Quiet luxury aesthetic: understated and tasteful, real fabric textures clearly visible, no flashy or branded elements, sophisticated restraint in every detail, expensive without trying.",
      camera: "Classic portrait framing, 50mm equivalent, clean composition, nothing excessive or dramatic, timeless elegance.",
      lighting: "Soft natural or classic studio light, even and flattering, no dramatic effects or trendy color grading, clean and timeless."
    }),
    preset("it-girl", "It-girl", "effortlessly cool, trendy, candid", {
      body: "Effortlessly cool pose that looks completely unstudied, weight natural, gaze confident or momentarily distracted, feels like the camera found her rather than she posed.",
      camera: "Editorial social portrait, 35mm feel, candid timing, subject caught mid-moment, slight asymmetry in framing.",
      lighting: "Natural and flattering without being obvious about it, available light, organic and real."
    }),
    preset("hot-girl-summer", "Hot girl summer", "sun-kissed, bright, confident", {
      lighting: "Bright sunny warm outdoor light, sun-kissed skin with real warmth, vivid clear sky, high energy, strong summer sun.",
      realism: "Sun-drenched Instagram quality: natural sun-kissed skin texture, real outdoor bright exposure, alive and vibrant.",
      body: "Confident open stance, full energy, summer attitude, ownership of the moment, nothing timid."
    }),
    preset("dark-academia", "Dark academia", "moody library, autumn, books", {
      lighting: "Low warm library or indoor practical light, amber tones, deep atmospheric shadows, intellectual moody atmosphere.",
      camera: "35mm or 50mm, warm desaturated color grade, autumnal rich tones, literary editorial composition.",
      realism: "Dark academia aesthetic: real fabric texture on scholarly or layered clothing, natural skin, muted rich tones, genuine atmosphere."
    }),
    preset("soft-glam", "Soft glam", "natural glam, glow, feminine", {
      lighting: "Soft flattering even light, subtle glow on skin, no harsh shadows, radiant and feminine quality, looks like the best natural light.",
      realism: "Natural glam: real dewy skin with no over-retouching, genuine radiance from lighting not post-processing, soft and luminous.",
      camera: "Flattering 50–85mm focal length, soft shallow depth of field, glam portrait framing."
    }),
    preset("baddie", "Baddie", "bold, attitude, confident", {
      body: "High-confidence pose, direct unwavering camera gaze, bold and intentional stance, nothing shy or soft about it.",
      lighting: "Bold direct light, defined shadows, high contrast, sharp and graphic, no soft romantic quality.",
      camera: "Eye level or low angle, power framing, sharp vertical social crop."
    }),
    preset("coastal-girl", "Coastal girl", "beach, ocean air, casual ease", {
      scene: "Beach, ocean shoreline, or coastal environment only: sea, sand, natural coastal elements, open horizon.",
      lighting: "Bright coastal light, ocean and sand reflections, sun in hair, carefree and alive.",
      realism: "Coastal lifestyle aesthetic: real salt-air quality, natural sun-touched skin, genuine outdoor feeling, no studio perfection."
    }),
    preset("boho", "Boho", "earthy, free spirit, textures", {
      lighting: "Warm golden natural light, earthy warm tones, organic dappled quality, sun-flare optional at edges.",
      realism: "Bohemian aesthetic: rich fabric textures, natural earthy colors, warm and soulful quality, nothing synthetic.",
      camera: "35mm film-like feel, warm color tone, organic natural composition, imperfect and alive."
    }),
    preset("streetwear-edit", "Streetwear", "urban, graphic, editorial", {
      scene: "Urban street, concrete wall, or architectural environment only: city context, graphic background elements.",
      camera: "Street editorial framing, 35mm, architectural lines used compositionally, urban gritty energy.",
      lighting: "Available urban light: daylight mixed with urban practicals, authentic street photography exposure, real city atmosphere."
    }),
    preset("coquette", "Coquette", "flirty, feminine, pink", {
      realism: "Coquette aesthetic: delicate textures clearly visible, soft feminine quality throughout, gentle and flirty atmosphere, nothing hard or aggressive.",
      lighting: "Soft pink-tinged or warm feminine light, gentle even glow, romantic diffused quality, dreamy softness.",
      camera: "Close-to-medium intimate crop, slightly tender framing, feminine and gentle composition."
    }),
    preset("quiet-luxury", "Quiet luxury", "understated, premium, no logos", {
      realism: "Quiet luxury: quality evident in texture and drape alone, no visible logos, fabric behavior and tailoring speak for themselves, sophisticated and timeless over trendy.",
      lighting: "Perfect even natural or soft studio light, nothing overdone or dramatic, tasteful and refined.",
      outfit: "Impeccably tailored or crafted garments with visible fabric quality, accurate drape and weight, no branding visible, accessories with quality hardware, clean and restrained."
    })
  ],
  outfit: [
    preset("bikini-resort", "Bikini / swimwear", "beach, pool, resort", {
      outfit: "Form-fitting bikini or one-piece swimwear: accurate fabric stretch, tie or clasp hardware details, wet or dry texture as appropriate to scene, realistic fit with no impossible coverage, accurate color and pattern."
    }),
    preset("athleisure", "Athleisure", "matching set, activewear", {
      outfit: "Matched athletic set or standalone workout outfit: form-fitting sports bra and leggings or biker shorts, compression fabric texture with visible weave, moisture-wicking appearance, brand detailing only if present in outfit reference."
    }),
    preset("night-out-mini", "Night out", "mini dress, heels, going out", {
      outfit: "Going-out mini dress or bodycon: accurate fabric sheen if satin or sequins, realistic hem and neckline, stiletto heels with accurate toe box and heel stem, clutch or small bag if shown in reference."
    }),
    preset("casual-cool", "Casual cool", "jeans, crop top, sneakers", {
      outfit: "Casual everyday: high-waisted jeans with accurate denim texture and seams, slight wear visible, cropped top with natural fabric weight, white sneakers with accurate sole profile and laces, minimal accessories."
    }),
    preset("designer-fit", "Designer look", "luxury, editorial, tailored", {
      outfit: "Luxury brand outfit: impeccable tailoring with fabric drape and weight visible, quality seams and construction, accessories with accurate hardware, nothing generic or mass-market. No logo guessing — only replicate what is visible in reference."
    }),
    preset("sundress", "Sundress", "flowy, feminine, summer", {
      outfit: "Flowing summer dress: light fabric with natural movement and drape in motion, accurate hem length, print or solid color with real textile behavior including subtle creasing, sandals or mules with accurate strap detail."
    }),
    preset("bodycon", "Bodycon", "fitted, elegant, curves", {
      outfit: "Form-fitting bodycon or sculpted dress: fabric compression accurately rendered against body, realistic stretch and visible seam lines, accurate neckline, heels with natural foot weight distribution."
    }),
    preset("streetwear-fit", "Streetwear", "oversized, layers, drip", {
      outfit: "Streetwear outfit: oversized silhouette with accurate fabric weight, hoodie or jacket with realistic drape, cargo or relaxed trouser fit, chunky sneakers with accurate sole unit and colorway, layering visible and plausible."
    }),
    preset("resort-white", "Resort white", "linen, clean, elegant", {
      outfit: "White or neutral linen or cotton resort wear: accurate natural fabric texture with wrinkle and weight, loose elegant fit, sandals with strap detail, minimal gold jewelry if reference shows, elevated and clean."
    }),
    preset("cozy-fit", "Cozy fit", "oversized, soft, comfort", {
      outfit: "Cozy oversized pieces: chunky knit sweater with real yarn texture, baggy sweatpants or biker shorts, thick socks, accurate fabric softness and drape, lived-in comfort without looking sloppy."
    }),
    preset("tennis-prep", "Tennis prep", "skirt, sporty, preppy", {
      outfit: "Preppy sporty look: tennis skirt with accurate knife or box pleat detail and fabric, fitted polo or ribbed top, low white leather sneakers, hair pulled back or visor, clean and detail-accurate."
    }),
    preset("monochrome", "Monochrome", "one color, striking, clean", {
      outfit: "Head-to-toe single color outfit: accurate tonal variation between different garment pieces and materials, coordinated without being identical, shoes and bag in same color family, striking silhouette with subtle texture contrast."
    })
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

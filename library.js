// Persistent image library — IndexedDB storage + modal UI

const LIB_DB_NAME = "NanoPromptLibrary";
const LIB_STORE   = "images";

// ── IndexedDB helpers ─────────────────────────────────────────────

function libOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LIB_DB_NAME, 1);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(LIB_STORE)) {
        const store = db.createObjectStore(LIB_STORE, { keyPath: "id" });
        store.createIndex("role",    "role",    { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function libPut(item) {
  const db = await libOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIB_STORE, "readwrite");
    tx.objectStore(LIB_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function libGetAll() {
  const db = await libOpen();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(LIB_STORE, "readonly");
    const req = tx.objectStore(LIB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function libRemove(id) {
  const db = await libOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIB_STORE, "readwrite");
    tx.objectStore(LIB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Thumbnail generator (small JPEG for display) ──────────────────

function genThumb(dataUrl, maxPx = 160) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth  * s);
      const h = Math.round(img.naturalHeight * s);
      const c = document.createElement("canvas");
      c.width  = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Save current slot image to library ───────────────────────────

async function saveCurrentToLibrary(roleId) {
  const image = state.images[roleId];
  if (!image) return;

  const btn = document.querySelector(`[data-save="${roleId}"]`);
  if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }

  try {
    const thumb = await genThumb(image.preview, 200);
    const id    = `${roleId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const label = { face: "Face", body: "Body", outfit: "Outfit", scene: "Scene" }[roleId] || roleId;
    await libPut({
      id,
      name:              `${label} — ${new Date().toLocaleDateString()}`,
      role:              roleId,
      thumb,
      preview:           image.preview,
      base64:            image.base64,
      mimeType:          image.mimeType || "image/jpeg",
      metadata:          image.metadata,
      analysis:          image.analysis || "",
      structuredAnalysis: image.structuredAnalysis || null,
      savedAt:           Date.now(),
      analyzed:          Boolean(image.analysis?.trim())
    });

    if (btn) btn.textContent = "Saved ✓";
    setTimeout(() => { if (btn) { btn.textContent = "Save"; btn.disabled = false; } }, 2200);
    await refreshLibBadge();
  } catch (err) {
    console.error("Library save failed:", err);
    if (btn) { btn.textContent = "Error"; btn.disabled = false; }
  }
}

// ── Count badge on the Library button ────────────────────────────

async function refreshLibBadge() {
  try {
    const items = await libGetAll();
    const badge = document.getElementById("libCountBadge");
    if (badge) badge.textContent = items.length > 0 ? items.length : "";
  } catch { /* ignore */ }
}

// ── Modal state ───────────────────────────────────────────────────

let libFilter = "all";
let libItems  = [];

async function openLibrary() {
  libItems = await libGetAll();
  libItems.sort((a, b) => b.savedAt - a.savedAt);
  const modal = document.getElementById("libraryModal");
  if (modal) { modal.style.display = "flex"; }
  renderLibrary();
}

function closeLibrary() {
  const modal = document.getElementById("libraryModal");
  if (modal) modal.style.display = "none";
}

// ── Render modal grid ─────────────────────────────────────────────

const ROLE_COLORS = { face: "#0c8ca3", body: "#7c6bc9", outfit: "#c97c1a", scene: "#2d8a4e" };
const ROLE_LABELS = { face: "Face", body: "Body", outfit: "Outfit", scene: "Scene" };

function renderLibrary() {
  const filtered = libFilter === "all"
    ? libItems
    : libItems.filter((i) => i.role === libFilter);

  // Update filter tab labels + counts
  ["all", "face", "body", "outfit", "scene"].forEach((f) => {
    const count = f === "all"
      ? libItems.length
      : libItems.filter((i) => i.role === f).length;
    const el   = document.querySelector(`[data-lib-filter="${f}"]`);
    if (!el) return;
    const base = f === "all" ? "All" : (ROLE_LABELS[f] || f);
    el.innerHTML = `${base}<span class="lib-tab-count">${count}</span>`;
    el.classList.toggle("active", f === libFilter);
  });

  const grid = document.getElementById("libraryGrid");
  if (!grid) return;

  if (filtered.length === 0) {
    const hint = libFilter === "all" ? "" : `${ROLE_LABELS[libFilter] || libFilter} `;
    grid.innerHTML = `<div class="lib-empty">
      <div class="lib-empty-icon">📂</div>
      <p>No ${hint}images saved yet.</p>
      <p>Upload an image, then click <strong>Save</strong> below the dropzone.</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map((item) => `
    <div class="lib-card" data-lib-id="${item.id}">
      <div class="lib-thumb">
        <img src="${item.thumb}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <span class="lib-role-pill" style="background:${ROLE_COLORS[item.role] || "#555"}">${ROLE_LABELS[item.role] || item.role}</span>
      </div>
      <div class="lib-card-body">
        <div class="lib-card-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="lib-card-meta">
          ${item.analyzed
            ? '<span class="lib-analyzed">✓ analyzed</span>'
            : '<span class="lib-not-analyzed">no analysis</span>'}
          · ${new Date(item.savedAt).toLocaleDateString()}
        </div>
        <div class="lib-card-actions">
          <button class="lib-use-btn" type="button" data-lib-use="${item.id}">Use in slot</button>
          <button class="lib-del-btn" type="button" data-lib-del="${item.id}" aria-label="Delete">✕</button>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll("[data-lib-use]").forEach((btn) =>
    btn.addEventListener("click", () => useFromLibrary(btn.dataset.libUse))
  );
  grid.querySelectorAll("[data-lib-del]").forEach((btn) =>
    btn.addEventListener("click", () => removeFromLibrary(btn.dataset.libDel))
  );
}

// ── Load a library image into its slot ───────────────────────────

async function useFromLibrary(id) {
  const item = libItems.find((i) => i.id === id);
  if (!item) return;

  state.images[item.role] = {
    name:              item.name,
    mimeType:          item.mimeType,
    base64:            item.base64,
    preview:           item.preview,
    analysis:          item.analysis,
    structuredAnalysis: item.structuredAnalysis,
    metadata:          item.metadata
  };
  state.analysisStatus[item.role] = item.analyzed
    ? `Loaded from library — ${item.metadata?.summary || ""}`
    : "Loaded from library — click Analyze to run vision";

  renderDropzones();
  updateOutput();
  closeLibrary();
}

// ── Delete a library item ─────────────────────────────────────────

async function removeFromLibrary(id) {
  if (!confirm("Remove this image from the library?")) return;
  await libRemove(id);
  libItems = libItems.filter((i) => i.id !== id);
  renderLibrary();
  await refreshLibBadge();
}

// ── Wire static UI elements ───────────────────────────────────────

document.getElementById("libraryOpenBtn")?.addEventListener("click", openLibrary);
document.getElementById("libraryCloseBtn")?.addEventListener("click", closeLibrary);

document.getElementById("libraryModal")?.addEventListener("click", (e) => {
  if (e.target.id === "libraryModal") closeLibrary();
});

document.querySelectorAll("[data-lib-filter]").forEach((btn) =>
  btn.addEventListener("click", () => {
    libFilter = btn.dataset.libFilter;
    renderLibrary();
  })
);

// Delegated listener for Save buttons rendered inside dropzones
document.getElementById("dropzones")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-save]");
  if (btn) saveCurrentToLibrary(btn.dataset.save);
});

// Init badge on page load
refreshLibBadge();

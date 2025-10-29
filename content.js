let lastSelectionText = "";
let lastTranslation = "";
let lastSelectionRange = null;
let bubbleEl = null;
let forceStyleEl = null;

const SELECTION_IDLE_MS = 350;
const MIN_CHARS = 2;

let isMouseDown = false;
let selectionIdleTimer = null;

// popup-driven flags
let globalEnabled = true;  // default ON
let sitePaused = false;

// when true, keep bubble even if selection clears (e.g., settings open)
let bubbleLocked = false;

/* ---------- Per-site prefs ---------- */
async function getSitePrefs() {
  const host = location.host;
  const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
  return (sitePrefs || {})[host] || {};
}
async function setSitePrefs(patch) {
  const host = location.host;
  const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
  const map = sitePrefs || {};
  map[host] = { ...(map[host] || {}), ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ sitePrefs: map });
}
async function getPerSiteTarget(defaultTarget = "en") {
  const prefs = await getSitePrefs();
  return prefs.targetLang || defaultTarget;
}
async function setPerSiteTarget(target) { await setSitePrefs({ targetLang: target }); }

/* ---------- Gating flags ---------- */
async function loadEnableFlags() {
  const { enabled } = await chrome.storage.sync.get(["enabled"]);
  globalEnabled = enabled !== false;
  const prefs = await getSitePrefs();
  sitePaused = !!prefs.paused;
  applyForceSelectable(!!prefs.forceSelectable);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    globalEnabled = changes.enabled.newValue !== false;
    if (!globalEnabled) removeBubble(true);
  }
  if (area === "local" && changes.sitePrefs) {
    const map = changes.sitePrefs.newValue || {};
    const entry = map[location.host] || {};
    sitePaused = !!entry.paused;
    applyForceSelectable(!!entry.forceSelectable);
    if (sitePaused) removeBubble(true);
  }
});

/* ---------- Force-selectable ---------- */
function applyForceSelectable(on) {
  if (on) {
    if (!forceStyleEl) {
      forceStyleEl = document.createElement("style");
      forceStyleEl.id = "it-force-select-style";
      forceStyleEl.textContent = `
        * { -webkit-user-select:text !important; user-select:text !important; }
        input, textarea, button, select { -webkit-user-select:auto !important; user-select:auto !important; }
      `;
      document.documentElement.appendChild(forceStyleEl);
    }
  } else {
    forceStyleEl?.remove();
    forceStyleEl = null;
  }
}

/* ---------- Bubble helpers ---------- */
function removeBubble(force = false) {
  if (!bubbleEl) return;
  if (!force && bubbleLocked) return; // don't auto-dismiss while settings open
  bubbleEl.remove();
  bubbleEl = null;
  bubbleLocked = false;
}
function setBubbleStatus(msg) {
  const out = bubbleEl?.querySelector("#it-output");
  if (out) out.textContent = msg;
}
function toPct(v) {
  if (typeof v !== "number") return 100;
  return v > 1 ? Math.round(v) : Math.round(v * 100);
}
function setBubbleOutput(text, src, tgt, detectInfo) {
  const out = bubbleEl?.querySelector("#it-output");
  if (!out) return;
  const hint = detectInfo?.code
    ? ` ~detected:${detectInfo.code}${detectInfo.confidence!=null ? `(${toPct(detectInfo.confidence)}%)` : ""}`
    : "";
  out.textContent = `(${src} → ${tgt})${hint} ${text}`;
}
function currentOrLastRange() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && sel.toString().trim().length >= MIN_CHARS) {
    return sel.getRangeAt(0).cloneRange();
  }
  return lastSelectionRange?.cloneRange ? lastSelectionRange.cloneRange() : null;
}
function replaceSelectionWith(text) {
  try {
    const r = currentOrLastRange();
    if (!r) return;
    r.deleteContents();
    const node = document.createTextNode(text);
    r.insertNode(node);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.setStartAfter(node);
      nr.collapse(true);
      sel.addRange(nr);
    }
  } catch (e) { console.warn("Replace failed:", e); }
}
function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).getBoundingClientRect?.() || null;
}

/* ---------- Translation core ---------- */
async function resolveLangs() {
  const cfg = await chrome.storage.sync.get(["sourceLang", "targetLang"]);
  const source = cfg.sourceLang || "auto";
  const defaultTarget = cfg.targetLang || "en";
  const target = await getPerSiteTarget(defaultTarget);
  return { source, target };
}
async function doTranslate(text) {
  const { source, target } = await resolveLangs();
  try {
    const { translateWithOnDeviceAI } = await import(chrome.runtime.getURL("translator.js"));

    const onProg = (e) => {
      const p = Math.max(0, Math.min(1, e?.detail?.loaded ?? 0)) * 100;
      const out = bubbleEl?.querySelector("#it-output");
      if (out && /Translating/.test(out.textContent)) out.textContent = `Downloading model… ${p.toFixed(0)}%`;
    };
    const onReady = () => {
      const out = bubbleEl?.querySelector("#it-output");
      if (out && /Downloading model/.test(out.textContent)) out.textContent = `Translating → ${target}…`;
      window.removeEventListener("translator-ready", onReady);
      window.removeEventListener("translator-progress", onProg);
    };
    window.addEventListener("translator-ready", onReady);
    window.addEventListener("translator-progress", onProg);

    setBubbleStatus(`Translating → ${target}…`);
    const res = await translateWithOnDeviceAI(text, source, target);

    window.removeEventListener("translator-ready", onReady);
    window.removeEventListener("translator-progress", onProg);

    if (!res?.ok) { setBubbleStatus(`⚠️ ${res?.error || "Translate failed"}`); return; }

    // Keep latest translation for Replace
    lastTranslation = res.output;

    setBubbleOutput(res.output, res.source || source, target, res.detectInfo || {});
    await setPerSiteTarget(target);
  } catch (e) {
    setBubbleStatus(`⚠️ Failed to load translator: ${e?.message || String(e)}`);
  }
}

/* ---------- Settings panel ---------- */
const LANGS = [
  ["auto","Auto"],
  ["en","English"], ["es","Spanish"], ["hi","Hindi"], ["te","Telugu"],
  ["ta","Tamil"], ["zh","Chinese"], ["fr","French"], ["de","German"],
  ["ja","Japanese"], ["ko","Korean"], ["ar","Arabic"], ["pt","Portuguese"],
  ["it","Italian"], ["ru","Russian"]
];
const LANGS_HTML = (cur) =>
  LANGS.map(([v,l]) => `<option value="${v}" ${v===cur?'selected':''}>${l}</option>`).join("");

async function buildSettingsHTML() {
  const cfg = await chrome.storage.sync.get(["sourceLang", "targetLang", "devFallback"]);
  const site = await getSitePrefs();
  const target = await getPerSiteTarget(cfg.targetLang || "en");
  return `
    <div class="it-row"><span class="it-label">Source</span>
      <select id="it-source">${LANGS_HTML(cfg.sourceLang || "auto")}</select>
    </div>
    <div class="it-row"><span class="it-label">Target</span>
      <select id="it-target">${LANGS_HTML(target)}</select>
    </div>
    <div class="it-row"><span class="it-label">Dev fallback</span>
      <input id="it-dev" type="checkbox" ${cfg.devFallback ? "checked": ""} />
    </div>
    <div class="it-row"><span class="it-label">Force selectable</span>
      <input id="it-force" type="checkbox" ${site.forceSelectable ? "checked": ""} />
      <span class="it-help">(enable if site blocks text selection)</span>
    </div>
  `;
}
async function attachSettings(panel) {
  panel.innerHTML = await buildSettingsHTML();
  const srcSel = panel.querySelector("#it-source");
  const tgtSel = panel.querySelector("#it-target");
  const devChk = panel.querySelector("#it-dev");
  const forceChk = panel.querySelector("#it-force");

  srcSel.addEventListener("change", async () => {
    await chrome.storage.sync.set({ sourceLang: srcSel.value });
  });
  tgtSel.addEventListener("change", async () => {
    await chrome.storage.sync.set({ targetLang: tgtSel.value });
    await setPerSiteTarget(tgtSel.value);
  });
  devChk.addEventListener("change", async () => {
    await chrome.storage.sync.set({ devFallback: devChk.checked });
  });
  forceChk.addEventListener("change", async () => {
    await setSitePrefs({ forceSelectable: forceChk.checked });
  });
}

/* ---------- Bubble UI ---------- */
function makeBubbleBase() {
  removeBubble(true);
  bubbleEl = document.createElement("div");
  bubbleEl.className = "inline-translate-bubble";
  bubbleEl.innerHTML = `
    <div class="it-row it-header">
      <strong>Translate</strong>
      <span class="it-drag" title="Drag">drag</span>
      <button id="it-settings" title="Settings" class="it-ghost">⚙︎</button>
    </div>
    <div class="it-settings-panel" id="it-settings-panel" hidden></div>
    <div class="it-output" id="it-output">Ready.</div>
    <div class="it-actions">
      <button id="it-swap">Swap</button>
      <button id="it-copy">Copy</button>
      <button id="it-replace">Replace</button>
      <button id="it-close">Close</button>
    </div>
  `;
  // prevent outside handlers + keep selection
  bubbleEl.addEventListener("mousedown", (e) => { e.stopPropagation(); }, true);
  bubbleEl.addEventListener("pointerdown", (e) => { e.stopPropagation(); }, true);
  document.body.appendChild(bubbleEl);

  chrome.storage.sync.get(["bubbleFontSize","bubbleMaxWidth"], (cfg) => {
    bubbleEl.style.fontSize = cfg.bubbleFontSize || "14px";
    bubbleEl.style.maxWidth = cfg.bubbleMaxWidth || "420px";
  });

  // drag
  const drag = bubbleEl.querySelector(".it-drag");
  let dragging=false,sx=0,sy=0,sl=0,st=0;
  drag.addEventListener("mousedown", (e) => {
    dragging=true; sx=e.clientX; sy=e.clientY;
    const r=bubbleEl.getBoundingClientRect(); sl=r.left+window.scrollX; st=r.top+window.scrollY;
    e.preventDefault(); e.stopPropagation();
  });
  document.addEventListener("mousemove", (e) => {
    if(!dragging||!bubbleEl) return;
    bubbleEl.style.left = `${sl + (e.clientX-sx)}px`;
    bubbleEl.style.top  = `${st + (e.clientY-sy)}px`;
  });
  document.addEventListener("mouseup", ()=>{ dragging=false; });

  // actions
  bubbleEl.querySelector("#it-close").onclick = () => removeBubble(true);
  bubbleEl.querySelector("#it-copy").onclick = () => {
    const txt = bubbleEl.querySelector("#it-output")?.textContent || "";
    navigator.clipboard.writeText(txt).catch(()=>{});
  };
  bubbleEl.querySelector("#it-replace").onclick = () => {
    const t = lastTranslation || `[Translated] ${lastSelectionText}`;
    replaceSelectionWith(t);
  };
  bubbleEl.querySelector("#it-swap").onclick = async () => {
    const { sourceLang, targetLang } = await chrome.storage.sync.get(["sourceLang","targetLang"]);
    const newSource = targetLang || "en";
    const newTarget = (sourceLang || "auto") === "auto" ? "en" : (sourceLang || "en");
    await chrome.storage.sync.set({ sourceLang:newSource, targetLang:newTarget });
    await setPerSiteTarget(newTarget);
    setBubbleStatus(`Swapped → ${newTarget}…`);
  };

  // SETTINGS — pre-lock on pointerdown + cancel pending debounce to avoid flash
  const btn = bubbleEl.querySelector("#it-settings");
  const panel = bubbleEl.querySelector("#it-settings-panel");

  btn.addEventListener("pointerdown", () => {
    bubbleLocked = true;          // lock before selectionchange fires
    clearTimeout(selectionIdleTimer); // cancel any pending re-bubble
  }, true);

  btn.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    clearTimeout(selectionIdleTimer);
    if (panel.hasAttribute("hidden")) {
      await attachSettings(panel);
      panel.removeAttribute("hidden");
      bubbleLocked = true;        // keep locked while visible
    } else {
      panel.setAttribute("hidden","");
      panel.textContent = "";
      bubbleLocked = false;
    }
  }, true);
}

function makeBubbleForSelection(text, rect) {
  makeBubbleBase();
  const docW = document.documentElement.clientWidth;
  const docH = document.documentElement.clientHeight;
  const top  = Math.max(8, Math.min(window.scrollY + rect.bottom + 8, window.scrollY + docH - 8));
  const left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + docW - 8));
  bubbleEl.style.top = `${top}px`;
  bubbleEl.style.left = `${left}px`;
  doTranslate(text);
}

/* ---------- Debounced selection ---------- */
function scheduleSelectionBubble() {
  clearTimeout(selectionIdleTimer);
  selectionIdleTimer = setTimeout(() => {
    // Guard: if settings are open, do nothing (prevents “flash” rebuild)
    if (bubbleLocked) return;

    if (!globalEnabled || sitePaused) { removeBubble(true); return; }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { removeBubble(); return; }

    const text = sel.toString().trim();
    if (text.length < MIN_CHARS) { removeBubble(); return; }

    lastSelectionRange = sel.getRangeAt(0).cloneRange();
    lastSelectionText = text;

    const rect = getSelectionRect();
    if (!rect) { removeBubble(); return; }

    makeBubbleForSelection(text, rect);
  }, SELECTION_IDLE_MS);
}

document.addEventListener("mousedown", () => { isMouseDown = true; }, true);
document.addEventListener("mouseup", () => {
  isMouseDown = false;
  if (bubbleLocked) return; // don't reschedule while settings open
  if (!globalEnabled || sitePaused) { removeBubble(true); return; }
  scheduleSelectionBubble();
}, true);

// If selection disappears (click elsewhere), hide bubble unless settings are open
document.addEventListener("selectionchange", () => {
  if (bubbleLocked) return;
  const txt = (window.getSelection()?.toString() || "").trim();
  if (txt.length < MIN_CHARS) { removeBubble(); return; }
  if (isMouseDown) return; // wait for mouseup
  scheduleSelectionBubble();
}, true);

// Click outside closes (unless settings open)
document.addEventListener("mousedown", (e) => {
  if (!bubbleEl) return;
  if (bubbleLocked) return;
  if (!bubbleEl.contains(e.target)) removeBubble(true);
}, true);

// Esc or window blur closes
document.addEventListener("keydown", (e) => { if (e.key === "Escape") removeBubble(true); });
window.addEventListener("blur", () => removeBubble());

/* ---------- Messages ---------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TRANSLATE_SELECTION") scheduleSelectionBubble();
  if (msg?.type === "RETRANSLATE_LAST" && lastSelectionText) {
    if (bubbleEl) doTranslate(lastSelectionText);
    else {
      const rect = getSelectionRect();
      if (rect) makeBubbleForSelection(lastSelectionText, rect);
    }
  }
});

/* ---------- Init ---------- */
loadEnableFlags();

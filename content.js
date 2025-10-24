// Inline bubble for translating selected text using Chrome built-in AI.
// Features: inline settings panel, progress indicator, swap, per-site memory,
// robust replace, dev fallback, and toolbar button opens settings in-page.

let lastSelectionText = "";
let lastTranslation = "";
let lastUsedLangs = { source: "auto", target: "en" };
let lastSelectionRange = null;
let bubbleEl = null;

// ---- Language list for inline settings ----
const LANGS = [
  ["auto","Auto"],
  ["en","English"], ["es","Spanish"], ["hi","Hindi"], ["te","Telugu"],
  ["ta","Tamil"], ["zh","Chinese"], ["fr","French"], ["de","German"],
  ["ja","Japanese"], ["ko","Korean"], ["ar","Arabic"], ["pt","Portuguese"],
  ["it","Italian"], ["ru","Russian"]
];

// ---- Per-site target memory ----
async function getPerSiteTarget(defaultTarget = "en") {
  try {
    const host = location.host;
    const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
    const map = sitePrefs || {};
    return map[host]?.targetLang || defaultTarget;
  } catch {
    return defaultTarget;
  }
}
async function setPerSiteTarget(target) {
  try {
    const host = location.host;
    const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
    const map = sitePrefs || {};
    map[host] = { ...(map[host] || {}), targetLang: target, updatedAt: Date.now() };
    await chrome.storage.local.set({ sitePrefs: map });
  } catch {}
}

// ---- Bubble helpers ----
function removeBubble() {
  if (bubbleEl && bubbleEl.parentNode) bubbleEl.parentNode.removeChild(bubbleEl);
  bubbleEl = null;
}

function setBubbleStatus(msg) {
  if (!bubbleEl) return;
  const out = bubbleEl.querySelector("#it-output");
  if (out) out.textContent = msg;
}

function setBubbleOutput(text, src, tgt, detectInfo) {
  if (!bubbleEl) return;
  const out = bubbleEl.querySelector("#it-output");
  if (!out) return;
  const hint = detectInfo?.detected && detectInfo.code
    ? ` ~detected:${detectInfo.code}${typeof detectInfo.confidence === "number" ? `(${Math.round(detectInfo.confidence*100)}%)` : ""}`
    : "";
  out.textContent = `(${src} → ${tgt})${hint} ${text}`;
}

function appendDiagnosticsIfError() {
  if (!bubbleEl) return;
  const out = bubbleEl.querySelector("#it-output");
  if (!out || !out.textContent.startsWith("⚠️")) return;
  try {
    const hasT = typeof self !== "undefined" && ("Translator" in self);
    const hasD = typeof self !== "undefined" && ("LanguageDetector" in self);
    out.textContent += `  (Translator: ${hasT} · Detector: ${hasD})`;
  } catch {}
}

function replaceSelectionWith(text) {
  try {
    const range = lastSelectionRange;
    if (!range) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.setStartAfter(node);
      newRange.collapse(true);
      sel.addRange(newRange);
    }
  } catch (e) {
    console.warn("Replace failed:", e);
  }
}

function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect?.();
  if (!rect) return null;
  return rect;
}

// ---- Translation core ----
async function resolveLangs() {
  const cfg = await chrome.storage.sync.get(["sourceLang", "targetLang"]);
  const source = cfg.sourceLang || "auto";
  const defaultTarget = cfg.targetLang || "en";
  const target = await getPerSiteTarget(defaultTarget);
  return { source, target };
}

async function doTranslate(text) {
  if (!chrome?.runtime?.id) {
    setBubbleStatus("⚠️ Extension reloaded. Refresh page.");
    appendDiagnosticsIfError();
    return null;
  }

  const { source, target } = await resolveLangs();
  lastUsedLangs = { source, target };

  try {
    const url = chrome.runtime.getURL("translator.js");
    const { translateWithOnDeviceAI } = await import(url);

    // progress listeners (per translation)
    const onProg = (e) => {
      const pct = Math.max(0, Math.min(1, (e?.detail?.loaded ?? 0))) * 100;
      setBubbleStatus(`Downloading model… ${pct.toFixed(0)}%`);
    };
    const onReady = () => {
      const out = bubbleEl?.querySelector("#it-output");
      if (out && /Downloading model/.test(out.textContent)) {
        setBubbleStatus(`Translating → ${target}…`);
      }
      window.removeEventListener('translator-progress', onProg);
      window.removeEventListener('translator-ready', onReady);
    };
    window.addEventListener('translator-progress', onProg);
    window.addEventListener('translator-ready', onReady);

    setBubbleStatus(`Translating → ${target}…`);
    const res = await translateWithOnDeviceAI(text, source, target);

    window.removeEventListener('translator-progress', onProg);
    window.removeEventListener('translator-ready', onReady);

    if (!res?.ok) {
      setBubbleStatus(`⚠️ ${res?.error || "Translate failed"}`);
      appendDiagnosticsIfError();
      return null;
    }

    lastTranslation = res.output;
    setBubbleOutput(res.output, res.source || source, target, res.detectInfo);
    await setPerSiteTarget(target);
    return lastTranslation;
  } catch (e) {
    setBubbleStatus(`⚠️ Failed to load translator: ${e?.message || String(e)}. Refresh page.`);
    appendDiagnosticsIfError();
    return null;
  }
}

// ---- Inline settings UI ----
const LANGS_HTML = (cur) =>
  LANGS.map(([v,l]) => `<option value="${v}" ${v===cur?'selected':''}>${l}</option>`).join("");

async function buildSettingsHTML() {
  const cfg = await chrome.storage.sync.get(["sourceLang", "targetLang", "devFallback"]);
  const { target } = await resolveLangs();
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
  `;
}

async function attachSettings(panel) {
  panel.innerHTML = await buildSettingsHTML();

  const srcSel = panel.querySelector("#it-source");
  const tgtSel = panel.querySelector("#it-target");
  const devChk = panel.querySelector("#it-dev");

  srcSel.addEventListener("change", async () => {
    await chrome.storage.sync.set({ sourceLang: srcSel.value });
    doTranslate(lastSelectionText || "Hello world"); // still works if opened from toolbar
  });

  tgtSel.addEventListener("change", async () => {
    await chrome.storage.sync.set({ targetLang: tgtSel.value });
    await setPerSiteTarget(tgtSel.value);
    doTranslate(lastSelectionText || "Hello world");
  });

  devChk.addEventListener("change", async () => {
    await chrome.storage.sync.set({ devFallback: devChk.checked });
    setBubbleStatus("Settings saved. Re-translating…");
    doTranslate(lastSelectionText || "Hello world");
  });
}

// ---- Bubble UI ----
function makeBubbleBase() {
  removeBubble();
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
      <button id="it-swap" title="Swap source/target">Swap</button>
      <button id="it-copy" title="Copy result">Copy</button>
      <button id="it-replace" title="Replace selection">Replace</button>
      <button id="it-close" title="Close">Close</button>
    </div>
  `;
  bubbleEl.addEventListener("mousedown", (e) => { e.stopPropagation(); }, true);
  document.body.appendChild(bubbleEl);

  chrome.storage.sync.get(["bubbleFontSize", "bubbleMaxWidth"], (cfg) => {
    bubbleEl.style.fontSize = cfg.bubbleFontSize || "14px";
    bubbleEl.style.maxWidth = cfg.bubbleMaxWidth || "420px";
  });

  // Dragging
  const dragHandle = bubbleEl.querySelector(".it-drag");
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  dragHandle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const r = bubbleEl.getBoundingClientRect();
    startLeft = r.left + window.scrollX;
    startTop  = r.top + window.scrollY;
    e.preventDefault(); e.stopPropagation();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging || !bubbleEl) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    bubbleEl.style.left = `${startLeft + dx}px`;
    bubbleEl.style.top  = `${startTop + dy}px`;
  });
  document.addEventListener("mouseup", () => { dragging = false; });

  // Actions
  bubbleEl.querySelector("#it-close").onclick = removeBubble;
  bubbleEl.querySelector("#it-copy").onclick = () => {
    const txt = bubbleEl.querySelector("#it-output")?.textContent || "";
    navigator.clipboard.writeText(txt).catch(() => {});
  };
  bubbleEl.querySelector("#it-replace").onclick = () => {
    const replaceText = lastTranslation || `[Translated] ${lastSelectionText}`;
    replaceSelectionWith(replaceText);
  };
  bubbleEl.querySelector("#it-swap").onclick = async () => {
    const { sourceLang, targetLang } = await chrome.storage.sync.get(["sourceLang", "targetLang"]);
    const newSource = (targetLang || "en");
    const newTarget = (sourceLang || "auto") === "auto" ? "en" : (sourceLang || "en");
    await chrome.storage.sync.set({ sourceLang: newSource, targetLang: newTarget });
    await setPerSiteTarget(newTarget);
    setBubbleStatus(`Swapped → ${newTarget}…`);
    if (lastSelectionText) doTranslate(lastSelectionText);
  };

  // Settings toggle
  const settingsBtn = bubbleEl.querySelector("#it-settings");
  const panel = bubbleEl.querySelector("#it-settings-panel");
  settingsBtn.onclick = async () => {
    if (panel.hasAttribute("hidden")) {
      panel.removeAttribute("hidden");
      await attachSettings(panel);
    } else {
      panel.setAttribute("hidden", "");
      panel.textContent = "";
    }
  };
}

function makeBubbleForSelection(text, rect) {
  makeBubbleBase();

  // Position near selection, clamped
  const docW = document.documentElement.clientWidth;
  const docH = document.documentElement.clientHeight;
  const top = Math.max(8, Math.min(window.scrollY + rect.bottom + 8, window.scrollY + docH - 8));
  const left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + docW - 8));
  bubbleEl.style.top = `${top}px`;
  bubbleEl.style.left = `${left}px`;

  setBubbleStatus("Preparing…");
  doTranslate(text);
}

async function openSettingsBubbleTopRight() {
  makeBubbleBase();

  // Top-right corner, with margin
  const margin = 16;
  const r = bubbleEl.getBoundingClientRect();
  const left = window.scrollX + document.documentElement.clientWidth - r.width - margin;
  const top  = window.scrollY + margin;
  bubbleEl.style.left = `${Math.max(8, left)}px`;
  bubbleEl.style.top  = `${Math.max(8, top)}px`;

  // Open panel by default
  const panel = bubbleEl.querySelector("#it-settings-panel");
  panel.removeAttribute("hidden");
  await attachSettings(panel);
  setBubbleStatus("Ready. Choose languages and select text to translate.");
}

// ---- Selection flow ----
function handleSelection(showEvenIfEmpty = false) {
  const sel = window.getSelection();
  if (!sel) return;
  if (sel.rangeCount > 0) lastSelectionRange = sel.getRangeAt(0).cloneRange();

  const text = sel.toString().trim();
  if (!text && !showEvenIfEmpty) { removeBubble(); return; }

  const rect = getSelectionRect();
  if (!rect) return;

  lastSelectionText = text || lastSelectionText;
  makeBubbleForSelection(lastSelectionText, rect);
}

document.addEventListener("mouseup", () => {
  const text = window.getSelection()?.toString().trim();
  if (text) handleSelection();
});

document.addEventListener("mousedown", (e) => {
  if (!bubbleEl) return;
  if (!bubbleEl.contains(e.target)) removeBubble();
}, true);

// Messages from background (context menu / command / toolbar)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TRANSLATE_SELECTION") handleSelection(true);
  if (msg?.type === "RETRANSLATE_LAST" && lastSelectionText) handleSelection(true);
  if (msg?.type === "OPEN_SETTINGS") openSettingsBubbleTopRight();
});

// ESC closes bubble
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") removeBubble();
});

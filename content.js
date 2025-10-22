// Inline bubble for translating selected text using Chrome built-in AI.
// Adds: Swap languages button + per-site target memory + robust replace + dev diagnostics.

let lastSelectionText = "";
let lastTranslation = "";
let lastUsedLangs = { source: "auto", target: "en" };
let lastSelectionRange = null; // saved range for Replace
let bubbleEl = null;

// ---- Per-site target memory helpers ----
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
  if (bubbleEl && bubbleEl.parentNode) {
    bubbleEl.parentNode.removeChild(bubbleEl);
  }
  bubbleEl = null;
}

function setBubbleStatus(msg) {
  if (!bubbleEl) return;
  const out = bubbleEl.querySelector("#it-output");
  if (out) out.textContent = msg;
}

function setBubbleOutput(text, src, tgt) {
  if (!bubbleEl) return;
  const out = bubbleEl.querySelector("#it-output");
  if (out) out.textContent = `(${src} → ${tgt}) ${text}`;
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

    // Move caret after inserted node and clear selection
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

    setBubbleStatus(`Translating → ${target}…`);
    const res = await translateWithOnDeviceAI(text, source, target);

    if (!res?.ok) {
      setBubbleStatus(`⚠️ ${res?.error || "Translate failed"}`);
      appendDiagnosticsIfError();
      return null;
    }

    lastTranslation = res.output;
    setBubbleOutput(res.output, res.source || source, target);

    // remember per-site target on success
    await setPerSiteTarget(target);
    return lastTranslation;
  } catch (e) {
    setBubbleStatus(`⚠️ Failed to load translator: ${e?.message || String(e)}. Refresh page.`);
    appendDiagnosticsIfError();
    return null;
  }
}

// ---- Bubble UI ----
function makeBubble(text, rect) {
  removeBubble();
  bubbleEl = document.createElement("div");
  bubbleEl.className = "inline-translate-bubble";
  bubbleEl.innerHTML = `
    <div class="it-row">
      <strong>Translate</strong>
      <span class="it-drag" title="Drag">drag</span>
    </div>
    <div class="it-output" id="it-output">Preparing…</div>
    <div class="it-actions">
      <button id="it-swap" title="Swap source/target">Swap</button>
      <button id="it-copy" title="Copy result">Copy</button>
      <button id="it-replace" title="Replace selection">Replace</button>
      <button id="it-close" title="Close">Close</button>
    </div>
  `;

  // Prevent bubble clicks from clearing selection
  bubbleEl.addEventListener("mousedown", (e) => { e.stopPropagation(); }, true);
  document.body.appendChild(bubbleEl);

  // Style options
  chrome.storage.sync.get(["bubbleFontSize", "bubbleMaxWidth"], (cfg) => {
    bubbleEl.style.fontSize = cfg.bubbleFontSize || "14px";
    bubbleEl.style.maxWidth = cfg.bubbleMaxWidth || "420px";
  });

  // Position near selection
  const top = Math.max(8, window.scrollY + rect.bottom + 8);
  const left = Math.max(8, window.scrollX + rect.left);
  bubbleEl.style.top = `${top}px`;
  bubbleEl.style.left = `${left}px`;

  // Dragging
  const dragHandle = bubbleEl.querySelector(".it-drag");
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  dragHandle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const r = bubbleEl.getBoundingClientRect();
    startLeft = r.left + window.scrollX;
    startTop  = r.top + window.scrollY;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging || !bubbleEl) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
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
    // swap source/target in storage, then re-translate and remember per-site target
    const { sourceLang, targetLang } = await chrome.storage.sync.get(["sourceLang", "targetLang"]);
    const newSource = (targetLang || "en");
    const newTarget = (sourceLang || "auto") === "auto" ? "en" : (sourceLang || "en"); // avoid target=auto
    await chrome.storage.sync.set({ sourceLang: newSource, targetLang: newTarget });
    await setPerSiteTarget(newTarget);
    setBubbleStatus(`Swapped → ${newTarget}…`);
    doTranslate(lastSelectionText);
  };

  // Start translation
  doTranslate(lastSelectionText);
}

// ---- Selection flow ----
function handleSelection(showEvenIfEmpty = false) {
  const sel = window.getSelection();
  if (!sel) return;

  // Save stable clone of the range for Replace
  if (sel.rangeCount > 0) {
    lastSelectionRange = sel.getRangeAt(0).cloneRange();
  }

  const text = sel.toString().trim();
  if (!text && !showEvenIfEmpty) {
    removeBubble();
    return;
  }

  const rect = getSelectionRect();
  if (!rect) return;

  lastSelectionText = text || lastSelectionText;
  makeBubble(lastSelectionText, rect);
}

document.addEventListener("mouseup", () => {
  const text = window.getSelection()?.toString().trim();
  if (text) handleSelection();
});

// Hide bubble on outside click
document.addEventListener("mousedown", (e) => {
  if (!bubbleEl) return;
  if (!bubbleEl.contains(e.target)) removeBubble();
}, true);

// Messages from background for context menu/command
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TRANSLATE_SELECTION") handleSelection(true);
  if (msg?.type === "RETRANSLATE_LAST" && lastSelectionText) handleSelection(true);
});

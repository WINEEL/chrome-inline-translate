// content.js
// Inline bubble for translating selected text using Chrome built-in AI.
// Stores the selection range so Replace works even after selection collapses.
// Handles extension reloads ("context invalidated") gracefully.

let lastSelectionText = "";
let lastTranslation = "";
let lastUsedLangs = { source: "auto", target: "en" };
let lastSelectionRange = null; // <-- save the range for Replace
let bubbleEl = null;

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

function replaceSelectionWith(text) {
  try {
    // Prefer the saved range (survives losing the live selection)
    const range = lastSelectionRange;
    if (!range) return;

    // Replace contents
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
    // Best-effort fallback: do nothing if the range is no longer valid (e.g., DOM changed)
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

async function doTranslate(text) {
  // Detect if extension context is valid
  if (!chrome?.runtime?.id) {
    setBubbleStatus("⚠️ Extension context was reloaded. Please refresh the page.");
    return null;
  }

  const cfg = await chrome.storage.sync.get(["sourceLang", "targetLang"]);
  const source = cfg.sourceLang || "auto";
  const target = cfg.targetLang || "en";
  lastUsedLangs = { source, target };

  try {
    // dynamic import of helper
    const url = chrome.runtime.getURL("translator.js");
    const { translateWithOnDeviceAI } = await import(url);

    setBubbleStatus(`Translating → ${target}...`);
    const res = await translateWithOnDeviceAI(text, source, target);

    if (!res?.ok) {
      setBubbleStatus(`⚠️ ${res?.error || "Translate failed"}`);
      return null;
    }

    lastTranslation = res.output;
    setBubbleOutput(res.output, res.source || source, target);
    return lastTranslation;
  } catch (e) {
    setBubbleStatus(`⚠️ Failed to load translator: ${e?.message || String(e)}. Refresh the page after reloading the extension.`);
    return null;
  }
}

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
      <button id="it-copy" title="Copy result">Copy</button>
      <button id="it-replace" title="Replace selection">Replace</button>
      <button id="it-close" title="Close">Close</button>
    </div>
  `;

  // Prevent clicks inside bubble from clearing our saved selection
  bubbleEl.addEventListener("mousedown", (e) => {
    // Don't steal focus selection
    e.stopPropagation();
  }, true);

  document.body.appendChild(bubbleEl);

  // Apply style options
  chrome.storage.sync.get(["bubbleFontSize", "bubbleMaxWidth"], (cfg) => {
    bubbleEl.style.fontSize = cfg.bubbleFontSize || "14px";
    bubbleEl.style.maxWidth = cfg.bubbleMaxWidth || "420px";
  });

  // Position near selection
  const top = Math.max(8, window.scrollY + rect.bottom + 8);
  const left = Math.max(8, window.scrollX + rect.left);
  bubbleEl.style.top = `${top}px`;
  bubbleEl.style.left = `${left}px`;

  // Drag handling
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

  // Kick off translation
  doTranslate(lastSelectionText);
}

function handleSelection(showEvenIfEmpty = false) {
  const sel = window.getSelection();
  if (!sel) return;

  // Save a stable clone of the selection range for Replace
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

// Show bubble after mouse selection
document.addEventListener("mouseup", () => {
  const sel = window.getSelection();
  const text = sel?.toString().trim();
  if (text) handleSelection();
});

// Hide bubble if user clicks outside it
document.addEventListener("mousedown", (e) => {
  if (!bubbleEl) return;
  if (!bubbleEl.contains(e.target)) {
    removeBubble();
  }
}, true);

// Messages from background for context menu and command
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TRANSLATE_SELECTION") handleSelection(true);
  if (msg?.type === "RETRANSLATE_LAST" && lastSelectionText) handleSelection(true);
});

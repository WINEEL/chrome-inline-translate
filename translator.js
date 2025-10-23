// Chrome on-device AI Translator/LanguageDetector wrapper.
// Emits window events for progress UI + supports dev fallback.

function emitProgress(loaded) {
  try { window.dispatchEvent(new CustomEvent('translator-progress', { detail: { loaded } })); } catch {}
}
function emitReady() {
  try { window.dispatchEvent(new CustomEvent('translator-ready')); } catch {}
}

function mockTranslate(text, source, target) {
  const tiny = {
    hello: { es: "hola", hi: "नमस्ते", te: "హలో", ta: "வணக்கம்", fr: "bonjour" },
    world: { es: "mundo", hi: "दुनिया", te: "ప్రపంచం", ta: "உலகம்", fr: "monde" }
  };
  const out = text.split(/\s+/).map(w => {
    const k = w.toLowerCase().replace(/[^a-z]/gi, "");
    const hit = tiny[k]?.[target];
    return hit ? w.replace(new RegExp(k, "i"), hit) : w;
  }).join(" ");
  return { ok: true, source: source || "auto", output: out === text ? `[${target}] ${text}` : out };
}

async function detectSourceIfNeeded(text, srcCandidate) {
  const hasDetector = typeof self !== "undefined" && ("LanguageDetector" in self);
  if (srcCandidate && srcCandidate !== "auto") return srcCandidate;
  if (!hasDetector) return "auto";
  try {
    const detector = await LanguageDetector.create();
    const res = await detector.detect(text);
    return res?.[0]?.detectedLanguage || "auto";
  } catch {
    return "auto";
  }
}

export async function translateWithOnDeviceAI(text, sourceLang, targetLang) {
  if (!text?.trim()) return { ok: false, error: "Empty text." };

  const cfg = await chrome.storage.sync.get(["devFallback"]);
  const useMock = !!cfg.devFallback;

  const hasTranslator = typeof self !== "undefined" && ("Translator" in self);
  if (!hasTranslator) {
    return useMock
      ? mockTranslate(text, sourceLang || "auto", targetLang || "en")
      : { ok: false, error: "Translator API not available on this Chrome." };
  }

  const target = targetLang || "en";
  const resolvedSrc = await detectSourceIfNeeded(text, sourceLang || "auto");

  try {
    // Only call availability() when we have concrete tags (not "auto")
    if (resolvedSrc !== "auto") {
      try {
        await Translator.availability({ sourceLanguage: resolvedSrc, targetLanguage: target });
      } catch { /* availability optional; ignore */ }
    }

    const translator = await Translator.create({
      sourceLanguage: resolvedSrc,
      targetLanguage: target,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          const v = typeof e.loaded === "number" ? e.loaded : 0;
          emitProgress(v);
          if (v >= 1) emitReady();
        });
      }
    });

    const out = await translator.translate(text);
    emitReady();
    return { ok: true, source: resolvedSrc, output: out };
  } catch (e) {
    if (useMock) return mockTranslate(text, resolvedSrc || "auto", target);
    return { ok: false, error: e?.message || String(e) };
  }
}

// Chrome on-device AI Translator/LanguageDetector wrapper.
// Emits window events for progress UI + supports dev fallback.
// Returns detectInfo {detected:boolean, code?:string, confidence?:number}

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
  return { ok: true, source: source || "auto", output: out === text ? `[${target}] ${text}` : out, detectInfo: { detected:false } };
}

async function detectSource(text, srcCandidate) {
  const hasDetector = typeof self !== "undefined" && ("LanguageDetector" in self);
  if (srcCandidate && srcCandidate !== "auto") {
    return { code: srcCandidate, confidence: 1, detected: false };
  }
  if (!hasDetector) {
    // Heuristic: if text contains many non-Latin letters, leave "auto"
    const latinRatio = (text.match(/[A-Za-z]/g)||[]).length / Math.max(1, text.length);
    return { code: latinRatio > 0.7 ? "en" : "auto", confidence: 0, detected: false };
  }
  try {
    const detector = await LanguageDetector.create();
    const res = await detector.detect(text);
    const best = Array.isArray(res) ? res[0] : null;
    // Only trust if reasonable length and confidence ≥ 0.55
    const conf = Number(best?.confidence ?? 0);
    const code = best?.detectedLanguage || "auto";
    const longEnough = text.trim().length >= 20;
    if (conf >= 0.55 || longEnough) {
      return { code, confidence: conf, detected: true };
    }
    return { code: "auto", confidence: conf, detected: false };
  } catch {
    return { code: "auto", confidence: 0, detected: false };
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
  const det = await detectSource(text, sourceLang || "auto");
  const resolvedSrc = det.code || "auto";

  try {
    if (resolvedSrc !== "auto") {
      try {
        await Translator.availability({ sourceLanguage: resolvedSrc, targetLanguage: target });
      } catch { /* optional */ }
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
    return { ok: true, source: resolvedSrc, output: out, detectInfo: det };
  } catch (e) {
    if (useMock) return mockTranslate(text, resolvedSrc || "auto", target);
    return { ok: false, error: e?.message || String(e) };
  }
}

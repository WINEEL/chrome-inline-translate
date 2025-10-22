// translator.js
// Thin wrapper around Chrome’s built-in on-device AI Translator + Language Detector.

export async function translateWithOnDeviceAI(text, sourceLang, targetLang) {
  if (!text?.trim()) return { ok: false, error: "Empty text." };

  // Built-in AI may be exposed as window.ai
  const ai = globalThis.ai || window.ai;
  if (!ai?.translator) {
    return { ok: false, error: "On-device Translator API not available in this Chrome." };
  }

  let src = sourceLang;
  try {
    // Auto-detect if requested
    if (!src || src === "auto") {
      if (!ai.languageDetector) {
        // detector optional — translator can accept "auto" in recent builds
        src = "auto";
      } else {
        const detector = await ai.languageDetector.create();
        const result = await detector.detect(text);
        // result: [{detectedLanguage:"en", confidence:0.99}, ...]
        src = result?.[0]?.detectedLanguage || "auto";
      }
    }

    const translator = await ai.translator.create({
      sourceLanguage: src,         // "auto" or a BCP-47 code like "en"
      targetLanguage: targetLang,  // e.g., "te", "hi", "es"
    });

    const out = await translator.translate(text);
    return { ok: true, source: src, output: out };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

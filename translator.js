let cached = {}; // key: `${src||auto}|${tgt}`

function dispatchProgress(p) {
  try { window.dispatchEvent(new CustomEvent("translator-progress", { detail: { loaded: p } })); } catch {}
}
function dispatchReady() { try { window.dispatchEvent(new CustomEvent("translator-ready")); } catch {} }

async function maybeDetectSource(text, source) {
  if (source && source !== "auto") return { code: source, confidence: 1, detected: true };
  try {
    if (!("LanguageDetector" in self)) return null;
    const det = await LanguageDetector.create();
    const r = await det.detect(text);
    const code =
      r?.language ?? r?.detectedLanguage ?? r?.detected ?? r?.code ?? r?.lang ?? "en";
    const conf =
      (typeof r?.confidence === "number" && r.confidence) ??
      (typeof r?.probability === "number" && r.probability) ??
      (typeof r?.score === "number" && r.score) ??
      1;
    return { code, confidence: conf, detected: true };
  } catch { return null; }
}

function mockTranslate(text, target) {
  const tiny = { es:{Hello:"Hola"}, te:{banana:"అరటిపండు"} };
  let out = text, map = tiny[target] || {};
  for (const [k,v] of Object.entries(map)) out = out.replace(new RegExp(`\\b${k}\\b`,"gi"), v);
  return `[${target}] ${out}`;
}

export async function translateWithOnDeviceAI(text, sourceLang, targetLang) {
  const { devFallback } = await chrome.storage.sync.get(["devFallback"]);

  if (!("Translator" in self)) {
    if (devFallback) return { ok:true, output: mockTranslate(text, targetLang), source: sourceLang || "auto", detectInfo:{detected:false} };
    return { ok:false, error:"On-device Translator API not available in this Chrome." };
  }

  try {
    const det = await maybeDetectSource(text, sourceLang);
    const src = det?.code || (sourceLang === "auto" ? undefined : sourceLang);

    const monitor = (m) => {
      m?.addEventListener?.("downloadprogress", (e) => dispatchProgress(e?.progress ?? e?.loaded ?? 0));
      m?.addEventListener?.("ready", () => dispatchReady());
    };

    const key = `${src || "auto"}|${targetLang}`;
    let translator = cached[key];
    if (!translator) {
      const opts = { targetLanguage: targetLang, monitor };
      if (src) opts.sourceLanguage = src;
      translator = await Translator.create(opts);
      cached[key] = translator;
      dispatchReady();
    }

    const output = await translator.translate(text);
    return { ok:true, output, source: src || "auto", detectInfo: det || { detected:false } };
  } catch (e) {
    if (devFallback) return { ok:true, output: mockTranslate(text, targetLang), source: sourceLang || "auto", detectInfo:{detected:false}, note:"dev-fallback" };
    return { ok:false, error: e?.message || String(e) };
  }
}

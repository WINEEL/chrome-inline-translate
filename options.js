const sourceEl = document.getElementById("sourceLang");
const targetEl = document.getElementById("targetLang");
const fsEl = document.getElementById("bubbleFontSize");
const mwEl = document.getElementById("bubbleMaxWidth");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(["sourceLang", "targetLang", "bubbleFontSize", "bubbleMaxWidth"], (cfg) => {
  sourceEl.value = cfg.sourceLang || "auto";
  targetEl.value = cfg.targetLang || "en";
  fsEl.value = cfg.bubbleFontSize || "14px";
  mwEl.value = cfg.bubbleMaxWidth || "420px";
});

document.getElementById("save").onclick = () => {
  chrome.storage.sync.set({
    sourceLang: sourceEl.value,
    targetLang: targetEl.value,
    bubbleFontSize: fsEl.value,
    bubbleMaxWidth: mwEl.value
  }, () => {
    statusEl.textContent = "Saved";
    setTimeout(() => statusEl.textContent = "", 1200);
  });
};

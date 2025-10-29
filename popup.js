const LANGS = [
  ["auto","Auto"],
  ["en","English"], ["es","Spanish"], ["hi","Hindi"], ["te","Telugu"],
  ["ta","Tamil"], ["zh","Chinese"], ["fr","French"], ["de","German"],
  ["ja","Japanese"], ["ko","Korean"], ["ar","Arabic"], ["pt","Portuguese"],
  ["it","Italian"], ["ru","Russian"]
];

function optionsHTML(cur) {
  return LANGS.map(([v,l]) => `<option value="${v}" ${v===cur?'selected':''}>${l}</option>`).join("");
}

function hostFrom(url) { try { return new URL(url).host; } catch { return ""; } }
async function activeTab() { const [t] = await chrome.tabs.query({active:true, currentWindow:true}); return t; }

async function load() {
  const tab = await activeTab();
  const host = hostFrom(tab?.url || "");
  document.getElementById("host").textContent = host ? `(${host})` : "";

  const sync = await chrome.storage.sync.get(["enabled","sourceLang","targetLang","devFallback"]);
  const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
  const entry = (sitePrefs || {})[host] || {};
  const resolvedTarget = entry.targetLang || sync.targetLang || "en";

  document.getElementById("g-toggle").checked = (sync.enabled !== false);
  document.getElementById("site-toggle").checked = !!entry.paused;

  const srcSel = document.getElementById("source");
  const tgtSel = document.getElementById("target");
  srcSel.innerHTML = optionsHTML(sync.sourceLang || "auto");
  tgtSel.innerHTML = optionsHTML(resolvedTarget);

  document.getElementById("dev").checked = !!sync.devFallback;
  document.getElementById("force").checked = !!entry.forceSelectable;

  document.getElementById("g-toggle").onchange = async (e) =>
    chrome.storage.sync.set({ enabled: !!e.target.checked });

  document.getElementById("site-toggle").onchange = async (e) => {
    const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
    const map = sitePrefs || {};
    map[host] = { ...(map[host] || {}), paused: !!e.target.checked, updatedAt: Date.now() };
    await chrome.storage.local.set({ sitePrefs: map });
  };

  srcSel.onchange = async () => {
    await chrome.storage.sync.set({ sourceLang: srcSel.value });
    chrome.tabs.sendMessage(tab.id, { type: "RETRANSLATE_LAST" }).catch(()=>{});
  };
  tgtSel.onchange = async () => {
    const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
    const map = sitePrefs || {};
    map[host] = { ...(map[host] || {}), targetLang: tgtSel.value, updatedAt: Date.now() };
    await chrome.storage.local.set({ sitePrefs: map });
    await chrome.storage.sync.set({ targetLang: tgtSel.value });
    chrome.tabs.sendMessage(tab.id, { type: "RETRANSLATE_LAST" }).catch(()=>{});
  };
  document.getElementById("dev").onchange = async (e) => {
    await chrome.storage.sync.set({ devFallback: !!e.target.checked });
    chrome.tabs.sendMessage(tab.id, { type: "RETRANSLATE_LAST" }).catch(()=>{});
  };
  document.getElementById("force").onchange = async (e) => {
    const { sitePrefs } = await chrome.storage.local.get(["sitePrefs"]);
    const map = sitePrefs || {};
    map[host] = { ...(map[host] || {}), forceSelectable: !!e.target.checked, updatedAt: Date.now() };
    await chrome.storage.local.set({ sitePrefs: map });
  };
}
load();

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    enabled: true,
    sourceLang: "auto",
    targetLang: "en",
    devFallback: false,
    bubbleFontSize: "14px",
    bubbleMaxWidth: "420px"
  };
  const cur = await chrome.storage.sync.get(Object.keys(defaults));
  const patch = {};
  for (const k of Object.keys(defaults)) if (typeof cur[k] === "undefined") patch[k] = defaults[k];
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "translate-selection",
      title: "Translate selection (Inline Translate)",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_SELECTION" });
  }
});

chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === "retranslate-last-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "RETRANSLATE_LAST" });
  }
});

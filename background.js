// Set defaults on install/update and create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    sourceLang: "auto",
    targetLang: "en",
    bubbleFontSize: "14px",
    bubbleMaxWidth: "420px",
    devFallback: true
  });

  chrome.contextMenus.create({
    id: "translateSelection",
    title: "Translate selection",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translateSelection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_SELECTION" });
  }
});

// Toolbar click -> open on-page settings bubble (no new tab)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "OPEN_SETTINGS" });
});

// Keyboard command to re-translate last selection
chrome.commands.onCommand.addListener((command) => {
  if (command === "retranslate-last-selection") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (id) chrome.tabs.sendMessage(id, { type: "RETRANSLATE_LAST" });
    });
  }
});

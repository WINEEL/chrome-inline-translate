// Set defaults on first install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    sourceLang: "auto",
    targetLang: "en",
    bubbleFontSize: "14px",
    bubbleMaxWidth: "420px",
    devFallback: true // keep true on your laptop; turn off on capable PC
  });

  // Context menu for selection
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "Translate selection",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translateSelection" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_SELECTION" });
  }
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

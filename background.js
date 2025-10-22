// Set defaults on first install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    sourceLang: "auto",
    targetLang: "en",
    bubbleFontSize: "14px",
    bubbleMaxWidth: "420px"
  });
});

// Optional context menu
chrome.runtime.onInstalled.addListener(() => {
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

// Keyboard command to re-translate
chrome.commands.onCommand.addListener((command) => {
  if (command === "retranslate-last-selection") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "RETRANSLATE_LAST" });
      }
    });
  }
});

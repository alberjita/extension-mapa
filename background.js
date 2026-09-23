chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(["prospects", "settings"]);
  const updates = {};

  if (!Array.isArray(stored.prospects)) updates.prospects = [];
  if (!stored.settings) {
    updates.settings = {
      version: 1,
      createdAt: new Date().toISOString()
    };
  }

  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
});

const toolbarAction = chrome.action || chrome.browserAction;

toolbarAction?.onClicked.addListener((tab) => {
  const isGoogleMaps = /^https:\/\/(?:www\.google\.(?:com|com\.co|com\.pe)|maps\.google\.(?:com|com\.co|com\.pe))\/maps(?:\/|$)/.test(tab.url || "");
  if (!tab.id || !isGoogleMaps) {
    chrome.tabs.create({ url: "https://www.google.com/maps" });
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "SHOW_CRM" }, () => {
    if (chrome.runtime.lastError) {
      chrome.tabs.reload(tab.id);
    }
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});

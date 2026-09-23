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

chrome.action.onClicked.addListener(async (tab) => {
  const isGoogleMaps = /^https:\/\/(?:www\.google\.(?:com|com\.co)|maps\.google\.com)\/maps(?:\/|$)/.test(tab.url || "");
  if (!tab.id || !isGoogleMaps) {
    await chrome.tabs.create({ url: "https://www.google.com/maps" });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_CRM" });
  } catch (error) {
    console.warn("No se pudo activar el CRM en esta pestaña.", error);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});

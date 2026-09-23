(() => {
  if (window.__MAPA_PROSPECTOS_CRM__) return;
  window.__MAPA_PROSPECTOS_CRM__ = true;

  const STORAGE_KEY = "prospects";
  const STATUS = {
    unreviewed: { label: "Sin revisar", color: "#64748b", symbol: "?" },
    pending: { label: "Pendiente", color: "#f59e0b", symbol: "!" },
    contact: { label: "Por contactar", color: "#8b5cf6", symbol: "☎" },
    contacted: { label: "Contactado", color: "#3b82f6", symbol: "✓" },
    interested: { label: "Interesado", color: "#06b6d4", symbol: "★" },
    quoted: { label: "Cotización enviada", color: "#ec4899", symbol: "$" },
    client: { label: "Cliente", color: "#16a34a", symbol: "✓" },
    rejected: { label: "No interesado", color: "#ef4444", symbol: "×" },
    blocked: { label: "No contactar", color: "#111827", symbol: "—" }
  };
  const GOOGLE_LISTS = {
    unreviewed: { name: "CRM · Sin revisar", emoji: "⚪" },
    pending: { name: "CRM · Pendiente", emoji: "🟡" },
    contact: { name: "CRM · Por contactar", emoji: "🟣" },
    contacted: { name: "CRM · Contactado", emoji: "🔵" },
    interested: { name: "CRM · Interesado", emoji: "🩵" },
    quoted: { name: "CRM · Cotización enviada", emoji: "🩷" },
    client: { name: "CRM · Cliente", emoji: "🟢" },
    rejected: { name: "CRM · No interesado", emoji: "🔴" },
    blocked: { name: "CRM · No contactar", emoji: "⚫" }
  };

  let active = false;
  let rootHost = null;
  let shadow = null;
  let currentPlace = null;
  let prospects = [];
  let observer = null;
  let detectTimer = null;
  let lastDetectedKey = "";
  let mapOverlayHost = null;
  let googleListsSync = true;
  let mapIsMoving = false;
  let mapPointerDown = false;
  let lastMapActivityAt = 0;
  let lastMapViewSignature = "";
  let viewMonitor = null;
  let mapPinMinZoom = 15;
  let mapSettleDelay = 700;

  const stripArtifacts = (value = "") => value
    .toString()
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();

  const cleanText = (value = "") => stripArtifacts(value).replace(/\s+/g, " ").trim();

  const cleanPhone = (value = "") => cleanText(value)
    .replace(/^(?:\+|00)\s*(?:51|57)(?:[\s().-]+|(?=\d))/i, "")
    .trim();

  const normalize = (value = "") => cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const escapeHtml = (value = "") => value.toString().replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));

  const cleanMapsUrl = (url = location.href) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.split("?")[0];
    }
  };

  const getText = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const aria = element?.getAttribute("aria-label") || "";
      const value = cleanText(element?.innerText || aria);
      if (value) return value;
    }
    return "";
  };

  const stripLabel = (value) => cleanText(value)
    .replace(/^(dirección|address|teléfono|phone|sitio web|website):?\s*/i, "")
    .trim();

  const findPlaceLink = () => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical?.includes("/maps/place/")) return cleanMapsUrl(canonical);
    if (location.pathname.includes("/maps/place/")) return cleanMapsUrl(location.href);
    const heading = document.querySelector("h1");
    const panel = heading?.closest('[role="main"]') || heading?.parentElement?.parentElement;
    return cleanMapsUrl(panel?.querySelector('a[href*="/maps/place/"]')?.href || location.href);
  };

  const extractCoordinates = (url) => {
    const encoded = url.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
    if (encoded) return { latitude: encoded[1], longitude: encoded[2] };
    const direct = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (direct) return { latitude: direct[1], longitude: direct[2] };
    return { latitude: "", longitude: "" };
  };

  function extractSelectedPlace() {
    const heading = [...document.querySelectorAll("h1")]
      .find((element) => element.offsetParent !== null && element.innerText.trim());
    const name = cleanText(heading?.innerText || "");
    const hasBusinessDetails = document.querySelector('[data-item-id="address"], [data-item-id="authority"], [data-item-id^="phone:tel:"]');

    if (!name || (!location.pathname.includes("/place/") && !hasBusinessDetails)) return null;

    const address = stripLabel(getText([
      'button[data-item-id="address"]',
      '[data-item-id="address"]',
      'button[aria-label^="Dirección"]',
      'button[aria-label^="Address"]'
    ]));
    const phone = cleanPhone(stripLabel(getText([
      'button[data-item-id^="phone:tel:"]',
      'button[data-item-id*="phone"]',
      'button[aria-label^="Teléfono"]',
      'button[aria-label^="Phone"]'
    ])));
    const websiteElement = document.querySelector('a[data-item-id="authority"], a[aria-label^="Sitio web"], a[aria-label^="Website"]');
    const website = websiteElement?.href || "";
    const mapUrl = findPlaceLink();
    const coordinates = extractCoordinates(location.href);

    return {
      name,
      address,
      phone,
      website,
      mapUrl,
      ...coordinates
    };
  }

  const placeKey = (place) => normalize(`${place.name}|${place.address}`);

  const findExisting = (place) => {
    const url = cleanMapsUrl(place.mapUrl);
    return prospects.find((item) => cleanMapsUrl(item.mapUrl) === url && url.includes("/place/"))
      || prospects.find((item) => placeKey(item) === placeKey(place));
  };

  const sanitizeRecord = (record) => ({
    ...record,
    name: cleanText(record.name),
    address: cleanText(record.address),
    phone: cleanPhone(record.phone),
    website: stripArtifacts(record.website),
    description: stripArtifacts(record.description)
  });

  async function loadProspects() {
    const result = await chrome.storage.local.get([STORAGE_KEY, "settings"]);
    const stored = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    googleListsSync = result.settings?.googleListsSync !== false;
    mapPinMinZoom = Number.isFinite(Number(result.settings?.mapPinMinZoom)) ? Number(result.settings.mapPinMinZoom) : 15;
    mapSettleDelay = Number.isFinite(Number(result.settings?.mapSettleDelay)) ? Number(result.settings.mapSettleDelay) : 700;
    prospects = stored.map(sanitizeRecord);
    if (JSON.stringify(stored) !== JSON.stringify(prospects)) {
      await chrome.storage.local.set({ [STORAGE_KEY]: prospects });
    }
    decorateVisibleResults();
  }

  function buildShell() {
    if (rootHost) return;
    rootHost = document.createElement("div");
    rootHost.id = "mapa-prospectos-extension";
    rootHost.style.cssText = "position:fixed;top:76px;right:18px;z-index:2147483647;width:min(390px,calc(100vw - 36px));font-family:Inter,Arial,sans-serif;";
    shadow = rootHost.attachShadow({ mode: "open" });
    document.documentElement.appendChild(rootHost);
    renderEmpty();
  }

  function baseStyles() {
    return `
      :host{all:initial;color:#172033}*{box-sizing:border-box}.panel{background:#fff;border:1px solid #dbe3ef;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.24);overflow:hidden}.top{display:flex;align-items:center;gap:10px;padding:13px 14px;background:linear-gradient(135deg,#172554,#1d4ed8);color:#fff}.logo{display:grid;place-items:center;width:34px;height:34px;background:#fff2;border-radius:10px;font-size:18px}.heading{min-width:0;flex:1}.heading strong{display:block;font-size:14px}.heading span{display:block;opacity:.78;font-size:11px;margin-top:2px}.iconbtn{border:0;border-radius:8px;background:#fff1;color:#fff;cursor:pointer;padding:7px 9px;font-size:12px}.body{padding:15px}.empty{text-align:center;padding:20px 10px;color:#64748b}.empty b{display:block;color:#172033;margin-bottom:6px}.actions{display:flex;gap:8px;margin-top:12px}.btn{border:0;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer}.primary{background:#2563eb;color:white;flex:1}.secondary{background:#eef2ff;color:#1e3a8a}.danger{background:#fee2e2;color:#b91c1c}.fields{display:grid;gap:10px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.field label{display:block;color:#526074;font-size:11px;font-weight:700;margin-bottom:5px}.field input,.field select,.field textarea{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:9px 10px;background:#fff;color:#172033;font:13px/1.3 Arial,sans-serif;outline:none}.field input:focus,.field select:focus,.field textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px #dbeafe}.field textarea{min-height:76px;resize:vertical}.title{font-size:17px;font-weight:800;margin:0 0 3px;line-height:1.25}.address{font-size:12px;color:#64748b;margin:0 0 13px}.saved{display:none;color:#15803d;font-size:12px;font-weight:700;align-items:center}.saved.show{display:flex}.footer{display:flex;align-items:center;gap:8px;margin-top:12px}.footer .actions{margin:0 0 0 auto}.statusline{height:5px;background:var(--status,#64748b)}.syncbox{margin-top:11px;padding:9px 10px;border:1px solid #dbeafe;border-radius:10px;background:#f8fbff;color:#334155;font-size:11px}.syncrow{display:flex;align-items:center;gap:7px;font-weight:700}.syncrow input{accent-color:#2563eb}.sync-help{margin-top:6px;color:#64748b}.sync-help summary{cursor:pointer;color:#1d4ed8;font-weight:700}.sync-help ul{max-height:105px;margin:7px 0 0;padding-left:20px;overflow:auto}.sync-help li{margin:3px 0}
    `;
  }

  function renderEmpty() {
    shadow.innerHTML = `
      <style>${baseStyles()}</style>
      <section class="panel">
        <header class="top">
          <div class="logo">📍</div>
          <div class="heading"><strong>Mapa de Prospectos</strong><span>Activo en Google Maps</span></div>
          <button class="iconbtn" id="open-dashboard">Ver base</button>
          <button class="iconbtn" id="close" title="Ocultar panel">✕</button>
        </header>
        <div class="body empty"><b>Selecciona un negocio</b>Haz clic en cualquier ficha o resultado de Google Maps para abrir su registro.</div>
      </section>`;
    wireCommonActions();
  }

  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function waitForElement(getter, timeout = 3500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = getter();
      if (result) return result;
      await delay(120);
    }
    return null;
  }

  const isVisible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");

  function findSaveButton() {
    const heading = [...document.querySelectorAll("h1")].find((element) => isVisible(element));
    const panel = heading?.closest('[role="main"]') || document;
    const selectors = [
      'button[data-item-id="save"]',
      'button[jsaction*="save"]',
      'button[aria-label^="Guardar"]',
      'button[aria-label^="Guardado"]',
      'button[aria-label^="Save"]',
      'button[aria-label^="Saved"]'
    ];
    for (const selector of selectors) {
      const button = [...panel.querySelectorAll(selector)].find(isVisible);
      if (button) return button;
    }
    return [...panel.querySelectorAll('button,[role="button"]')].find((element) => {
      const text = normalize(`${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`);
      return isVisible(element) && /^(guardar|guardado|save|saved)(\s|$)/.test(text);
    }) || null;
  }

  function findListDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
    return dialogs.find((dialog) => /(guardar|guardado|lista|save|saved|list)/.test(normalize(dialog.textContent)))
      || dialogs.at(-1)
      || null;
  }

  function findListRow(scope, listName) {
    const expected = normalize(listName);
    const textElement = [...scope.querySelectorAll("span,div,label")]
      .filter((element) => isVisible(element) && normalize(element.textContent) === expected)
      .sort((a, b) => a.childElementCount - b.childElementCount)[0];
    if (!textElement) return null;
    const row = textElement.closest('[role="menuitemcheckbox"],[role="option"],[role="checkbox"],label,button,[jsaction]')
      || textElement.parentElement;
    const control = row?.matches('input[type="checkbox"],[role="checkbox"]')
      ? row
      : row?.querySelector('input[type="checkbox"],[role="checkbox"]');
    return { row, control: control || row };
  }

  function isListRowChecked(item) {
    if (!item?.control) return false;
    if (item.control.matches('input[type="checkbox"]')) return item.control.checked;
    return item.control.getAttribute("aria-checked") === "true"
      || item.row?.getAttribute("aria-selected") === "true"
      || Boolean(item.row?.querySelector('input[type="checkbox"]:checked,[role="checkbox"][aria-checked="true"]'));
  }

  async function syncGoogleMapsList(statusKey) {
    const desired = GOOGLE_LISTS[statusKey] || GOOGLE_LISTS.unreviewed;
    const saveButton = findSaveButton();
    if (!saveButton) return { ok: false, message: "No encontré el botón Guardar de Google Maps." };

    saveButton.click();
    const dialog = await waitForElement(findListDialog);
    if (!dialog) return { ok: false, message: "Google Maps no abrió el selector de listas." };

    const desiredItem = findListRow(dialog, desired.name);
    if (!desiredItem) {
      const close = [...dialog.querySelectorAll('button,[role="button"]')].find((element) => {
        const text = normalize(`${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`);
        return /^(cerrar|close|cancelar|cancel)(\s|$)/.test(text);
      });
      close?.click();
      return { ok: false, message: `Crea primero la lista “${desired.name}” con el icono ${desired.emoji}.` };
    }

    for (const [key, list] of Object.entries(GOOGLE_LISTS)) {
      if (key === statusKey) continue;
      const item = findListRow(dialog, list.name);
      if (item && isListRowChecked(item)) {
        item.control.click();
        await delay(100);
      }
    }

    const refreshedDesired = findListRow(dialog, desired.name) || desiredItem;
    if (!isListRowChecked(refreshedDesired)) {
      refreshedDesired.control.click();
      await delay(150);
    }

    const done = [...dialog.querySelectorAll('button,[role="button"]')].find((element) => {
      const text = normalize(`${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`);
      return /^(listo|hecho|done|guardar|save)(\s|$)/.test(text);
    });
    done?.click();
    return { ok: true, message: `${desired.emoji} Sincronizado con “${desired.name}”.` };
  }

  function renderPlace(place) {
    const existing = findExisting(place);
    const record = existing || {
      ...place,
      status: "unreviewed",
      description: "",
      lastContact: ""
    };
    const status = STATUS[record.status] || STATUS.unreviewed;

    shadow.innerHTML = `
      <style>${baseStyles()}</style>
      <section class="panel">
        <div class="statusline" style="--status:${status.color}"></div>
        <header class="top">
          <div class="logo">🏪</div>
          <div class="heading"><strong>Ficha del negocio</strong><span>${existing ? "Registro guardado" : "Nuevo prospecto"}</span></div>
          <button class="iconbtn" id="open-dashboard">Ver base</button>
          <button class="iconbtn" id="close" title="Ocultar panel">✕</button>
        </header>
        <form class="body" id="record-form">
          <h2 class="title">${escapeHtml(record.name)}</h2>
          <p class="address">${escapeHtml(record.address || "Dirección no detectada")}</p>
          <div class="fields">
            <div class="grid2">
              <div class="field"><label>Teléfono</label><input name="phone" value="${escapeHtml(record.phone || "")}" placeholder="Número local, sin prefijo"></div>
              <div class="field"><label>Último contacto</label><input name="lastContact" type="date" value="${escapeHtml(record.lastContact || "")}"></div>
            </div>
            <div class="field"><label>Página web</label><input name="website" type="url" value="${escapeHtml(record.website || "")}" placeholder="https://..."></div>
            <div class="field"><label>Estado</label><select name="status">${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${record.status === key ? "selected" : ""}>${value.label}</option>`).join("")}</select></div>
            <div class="field"><label>Descripción / notas comerciales</label><textarea name="description" placeholder="Qué necesita, con quién hablaste, próxima acción...">${escapeHtml(record.description || "")}</textarea></div>
          </div>
          <div class="syncbox">
            <label class="syncrow"><input id="sync-google-lists" type="checkbox" ${googleListsSync ? "checked" : ""}> Sincronizar el estado con una lista de Google Maps</label>
            <details class="sync-help"><summary>Listas necesarias e iconos</summary><ul>${Object.values(GOOGLE_LISTS).map((item) => `<li>${item.emoji} ${escapeHtml(item.name)}</li>`).join("")}</ul></details>
          </div>
          <div class="footer">
            <span class="saved" id="saved">✓ Guardado</span>
            <div class="actions">
              ${existing ? '<button type="button" class="btn danger" id="delete">Eliminar</button>' : ""}
              <button class="btn primary" type="submit">Guardar negocio</button>
            </div>
          </div>
        </form>
      </section>`;

    wireCommonActions();
    shadow.querySelector("#record-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      googleListsSync = shadow.querySelector("#sync-google-lists")?.checked !== false;
      const now = new Date().toISOString();
      const next = {
        ...record,
        ...place,
        id: existing?.id || crypto.randomUUID(),
        phone: cleanPhone(data.get("phone")),
        website: stripArtifacts(data.get("website")),
        status: data.get("status"),
        description: stripArtifacts(data.get("description")),
        lastContact: data.get("lastContact"),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      prospects = existing
        ? prospects.map((item) => item.id === existing.id ? next : item)
        : [...prospects, next];
      const storedSettings = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({
        [STORAGE_KEY]: prospects,
        settings: { ...(storedSettings.settings || {}), googleListsSync }
      });
      currentPlace = next;
      renderPlace(next);
      const saved = shadow.querySelector("#saved");
      saved?.classList.add("show");
      decorateVisibleResults();
      if (googleListsSync) {
        const alreadySynchronized = existing?.googleListStatus === next.status;
        if (saved) saved.textContent = alreadySynchronized ? "Lista de Google Maps ya sincronizada" : "Sincronizando con Google Maps…";
        const syncResult = alreadySynchronized
          ? { ok: true, message: `${GOOGLE_LISTS[next.status]?.emoji || "✓"} Lista de Google Maps ya sincronizada.` }
          : await syncGoogleMapsList(next.status);
        if (saved) {
          saved.textContent = syncResult.message;
          saved.style.color = syncResult.ok ? "#15803d" : "#b45309";
        }
        if (syncResult.ok && !alreadySynchronized) {
          next.googleListStatus = next.status;
          prospects = prospects.map((item) => item.id === next.id ? next : item);
          currentPlace = next;
          await chrome.storage.local.set({ [STORAGE_KEY]: prospects });
        }
      } else if (saved) {
        saved.textContent = "✓ Guardado localmente";
      }
      setTimeout(() => saved?.classList.remove("show"), 4200);
    });

    shadow.querySelector("#delete")?.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar el registro de ${record.name}?`)) return;
      prospects = prospects.filter((item) => item.id !== existing.id);
      await chrome.storage.local.set({ [STORAGE_KEY]: prospects });
      renderPlace(place);
      decorateVisibleResults();
    });
  }

  function wireCommonActions() {
    shadow.querySelector("#close")?.addEventListener("click", () => {
      rootHost.style.display = "none";
      lastDetectedKey = "";
    });
    shadow.querySelector("#open-dashboard")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    });
  }

  function detectPlace() {
    if (!active) return;
    const place = extractSelectedPlace();
    if (!place) return;
    const key = `${placeKey(place)}|${place.mapUrl}`;
    if (key === lastDetectedKey && rootHost?.style.display !== "none") return;
    lastDetectedKey = key;
    currentPlace = place;
    buildShell();
    rootHost.style.display = "block";
    renderPlace(place);
  }

  function scheduleDetection(delay = 650) {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(() => {
      detectPlace();
      decorateVisibleResults();
    }, delay);
  }

  function getMapRect() {
    const candidates = [
      document.querySelector("#scene"),
      document.querySelector(".widget-scene"),
      ...document.querySelectorAll("canvas")
    ].filter(Boolean);
    const rects = candidates
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 300 && rect.height > 240 && rect.bottom > 0 && rect.right > 0);
    return rects.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  }

  function getMapView() {
    const match = decodeURIComponent(location.href).match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),([\d.]+)z/);
    if (!match) return null;
    return { latitude: Number(match[1]), longitude: Number(match[2]), zoom: Number(match[3]) };
  }

  function worldPoint(latitude, longitude) {
    const limitedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const sine = Math.sin(limitedLatitude * Math.PI / 180);
    return {
      x: (longitude + 180) / 360,
      y: 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)
    };
  }

  function ensureMapOverlay() {
    if (mapOverlayHost) return mapOverlayHost;
    mapOverlayHost = document.createElement("div");
    mapOverlayHost.id = "gmp-crm-map-overlay";
    document.documentElement.appendChild(mapOverlayHost);
    return mapOverlayHost;
  }

  function renderStoredMapPins(skipRecordIds = new Set()) {
    const overlay = ensureMapOverlay();
    overlay.replaceChildren();
    if (!active || !prospects.length || mapIsMoving) {
      overlay.style.opacity = "0";
      return;
    }

    const rect = getMapRect();
    const view = getMapView();
    if (!rect || !view || view.zoom < mapPinMinZoom) {
      overlay.style.opacity = "0";
      return;
    }
    overlay.style.opacity = "1";

    const center = worldPoint(view.latitude, view.longitude);
    const scale = 256 * (2 ** view.zoom);

    for (const record of prospects) {
      if (skipRecordIds.has(record.id)) continue;
      const latitude = Number(record.latitude);
      const longitude = Number(record.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const point = worldPoint(latitude, longitude);
      let deltaX = point.x - center.x;
      if (deltaX > 0.5) deltaX -= 1;
      if (deltaX < -0.5) deltaX += 1;
      const x = rect.left + rect.width / 2 + deltaX * scale;
      const y = rect.top + rect.height / 2 + (point.y - center.y) * scale;
      if (x < rect.left + 12 || x > rect.right - 12 || y < rect.top + 30 || y > rect.bottom - 8) continue;

      const status = STATUS[record.status] || STATUS.unreviewed;
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "gmp-crm-custom-pin";
      pin.style.left = `${x}px`;
      pin.style.top = `${y}px`;
      pin.style.setProperty("--gmp-crm-color", status.color);
      pin.title = `${record.name} · ${status.label}`;
      pin.setAttribute("aria-label", pin.title);
      pin.innerHTML = `<span>${escapeHtml(status.symbol)}</span>`;
      pin.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        currentPlace = record;
        lastDetectedKey = `${placeKey(record)}|${record.mapUrl}`;
        buildShell();
        rootHost.style.display = "block";
        renderPlace(record);
      });
      overlay.appendChild(pin);
    }
  }

  function decorateVisibleResults() {
    document.querySelectorAll("[data-gmp-crm-status]").forEach((element) => {
      element.removeAttribute("data-gmp-crm-status");
      element.removeAttribute("data-gmp-crm-label");
      element.style.removeProperty("--gmp-crm-color");
    });
    document.querySelectorAll("[data-gmp-crm-map-marker]").forEach((element) => {
      element.removeAttribute("data-gmp-crm-map-marker");
      element.removeAttribute("data-gmp-crm-symbol");
      element.style.removeProperty("--gmp-crm-color");
    });
    if (!active || !prospects.length) {
      renderStoredMapPins();
      return;
    }

    const anchors = [...document.querySelectorAll('a[href*="/maps/place/"]')];
    for (const anchor of anchors) {
      const href = cleanMapsUrl(anchor.href);
      const text = normalize(anchor.textContent || anchor.getAttribute("aria-label") || "");
      const record = prospects.find((item) => cleanMapsUrl(item.mapUrl) === href)
        || prospects.find((item) => text && normalize(item.name) === text);
      if (!record) continue;
      const status = STATUS[record.status] || STATUS.unreviewed;
      anchor.setAttribute("data-gmp-crm-status", record.status);
      anchor.setAttribute("data-gmp-crm-label", status.label);
      anchor.style.setProperty("--gmp-crm-color", status.color);
    }

    const mapRect = getMapRect();
    const mapView = getMapView();
    if (mapIsMoving || !mapView || mapView.zoom < mapPinMinZoom) {
      renderStoredMapPins();
      return;
    }
    const nativeMarkerRecordIds = new Set();
    const namedMapElements = [...document.querySelectorAll('[role="button"][aria-label], [role="img"][aria-label]')];
    for (const element of namedMapElements) {
      const label = normalize(element.getAttribute("aria-label") || "");
      if (!label) continue;
      const bounds = element.getBoundingClientRect();
      if (mapRect && (bounds.left < mapRect.left || bounds.right > mapRect.right || bounds.width > 120 || bounds.height > 120)) continue;
      const record = prospects.find((item) => {
        const name = normalize(item.name);
        return name && (name === label || label.includes(name));
      });
      if (!record) continue;
      const status = STATUS[record.status] || STATUS.unreviewed;
      const markerHost = element.tagName === "IMG" ? element.parentElement : element;
      if (!markerHost) continue;
      markerHost.setAttribute("data-gmp-crm-map-marker", record.status);
      markerHost.setAttribute("data-gmp-crm-symbol", status.symbol);
      markerHost.style.setProperty("--gmp-crm-color", status.color);
      nativeMarkerRecordIds.add(record.id);
    }
    renderStoredMapPins(nativeMarkerRecordIds);
  }

  function isPointInsideMap(clientX, clientY) {
    const rect = getMapRect();
    return Boolean(rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom);
  }

  function beginMapMovement() {
    mapIsMoving = true;
    lastMapActivityAt = Date.now();
    document.documentElement.classList.add("gmp-crm-map-moving");
    if (mapOverlayHost) mapOverlayHost.style.opacity = "0";
  }

  function currentMapViewSignature() {
    const view = getMapView();
    return view ? `${view.latitude.toFixed(7)}|${view.longitude.toFixed(7)}|${view.zoom.toFixed(2)}` : "";
  }

  function noteMapActivity() {
    if (!mapIsMoving) beginMapMovement();
    lastMapActivityAt = Date.now();
    if (mapOverlayHost) mapOverlayHost.style.opacity = "0";
  }

  function showPinsAfterStableView() {
    if (!mapIsMoving || mapPointerDown) return;
    const signature = currentMapViewSignature();
    if (signature !== lastMapViewSignature) {
      lastMapViewSignature = signature;
      lastMapActivityAt = Date.now();
      return;
    }
    if (Date.now() - lastMapActivityAt < mapSettleDelay) return;
    mapIsMoving = false;
    document.documentElement.classList.remove("gmp-crm-map-moving");
    decorateVisibleResults();
  }

  function handleMapPointerDown(event) {
    if (!isPointInsideMap(event.clientX, event.clientY)) return;
    mapPointerDown = true;
    lastMapViewSignature = currentMapViewSignature();
    beginMapMovement();
  }

  function handleMapPointerUp() {
    if (!mapPointerDown) return;
    mapPointerDown = false;
    noteMapActivity();
  }

  function handleMapWheel(event) {
    if (!isPointInsideMap(event.clientX, event.clientY)) return;
    mapPointerDown = false;
    noteMapActivity();
  }

  function handleViewportChange() {
    mapPointerDown = false;
    noteMapActivity();
  }

  function startWatching() {
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("pointerdown", handleMapPointerDown, true);
    document.addEventListener("pointerup", handleMapPointerUp, true);
    document.addEventListener("pointercancel", handleMapPointerUp, true);
    document.addEventListener("wheel", handleMapWheel, { capture: true, passive: true });
    window.addEventListener("resize", handleViewportChange);
    observer = new MutationObserver(() => scheduleDetection(700));
    observer.observe(document.body, { childList: true, subtree: true });
    lastMapViewSignature = currentMapViewSignature();
    viewMonitor = setInterval(() => {
      const signature = currentMapViewSignature();
      if (signature !== lastMapViewSignature) {
        lastMapViewSignature = signature;
        noteMapActivity();
      }
      showPinsAfterStableView();
    }, 100);
    scheduleDetection(100);
  }

  function stopWatching() {
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("pointerdown", handleMapPointerDown, true);
    document.removeEventListener("pointerup", handleMapPointerUp, true);
    document.removeEventListener("pointercancel", handleMapPointerUp, true);
    document.removeEventListener("wheel", handleMapWheel, true);
    window.removeEventListener("resize", handleViewportChange);
    observer?.disconnect();
    observer = null;
    clearInterval(viewMonitor);
    viewMonitor = null;
    clearTimeout(detectTimer);
  }

  function handleDocumentClick(event) {
    if (rootHost?.contains(event.target)) return;
    scheduleDetection(450);
    setTimeout(detectPlace, 1300);
  }

  async function setActive(next, showPanel = false) {
    active = next;
    if (active) {
      await loadProspects();
      if (showPanel) {
        buildShell();
        rootHost.style.display = "block";
      }
      if (!observer) startWatching();
    } else {
      stopWatching();
      if (rootHost) rootHost.style.display = "none";
      decorateVisibleResults();
      lastDetectedKey = "";
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SHOW_CRM" || message?.type === "TOGGLE_CRM") {
      if (!active) {
        setActive(true, true);
      } else {
        buildShell();
        rootHost.style.display = "block";
        detectPlace();
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      const settings = changes.settings.newValue || {};
      googleListsSync = settings.googleListsSync !== false;
      mapPinMinZoom = Number.isFinite(Number(settings.mapPinMinZoom)) ? Number(settings.mapPinMinZoom) : 15;
      mapSettleDelay = Number.isFinite(Number(settings.mapSettleDelay)) ? Number(settings.mapSettleDelay) : 700;
      decorateVisibleResults();
    }
    if (changes[STORAGE_KEY]) {
      prospects = Array.isArray(changes[STORAGE_KEY].newValue)
        ? changes[STORAGE_KEY].newValue.map(sanitizeRecord)
        : [];
      decorateVisibleResults();
      if (currentPlace && active && rootHost?.style.display !== "none") renderPlace(currentPlace);
    }
  });

  setActive(true).catch((error) => console.warn("No se pudo iniciar Mapa de Prospectos.", error));
})();

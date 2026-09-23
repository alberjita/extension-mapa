(() => {
  if (window.__MAPA_PROSPECTOS_CRM__) return;
  window.__MAPA_PROSPECTOS_CRM__ = true;

  const STORAGE_KEY = "prospects";
  const STATUS = {
    unreviewed: { label: "Sin revisar", color: "#64748b" },
    pending: { label: "Pendiente", color: "#f59e0b" },
    contact: { label: "Por contactar", color: "#8b5cf6" },
    contacted: { label: "Contactado", color: "#3b82f6" },
    interested: { label: "Interesado", color: "#06b6d4" },
    quoted: { label: "Cotización enviada", color: "#ec4899" },
    client: { label: "Cliente", color: "#16a34a" },
    rejected: { label: "No interesado", color: "#ef4444" },
    blocked: { label: "No contactar", color: "#111827" }
  };

  let active = false;
  let rootHost = null;
  let shadow = null;
  let currentPlace = null;
  let prospects = [];
  let observer = null;
  let detectTimer = null;
  let lastDetectedKey = "";

  const normalize = (value = "") => value
    .toString()
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
      const value = element?.innerText?.trim() || aria.trim();
      if (value) return value;
    }
    return "";
  };

  const stripLabel = (value) => value
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
    const direct = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (direct) return { latitude: direct[1], longitude: direct[2] };
    const encoded = url.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
    return encoded ? { latitude: encoded[1], longitude: encoded[2] } : { latitude: "", longitude: "" };
  };

  function extractSelectedPlace() {
    const heading = [...document.querySelectorAll("h1")]
      .find((element) => element.offsetParent !== null && element.innerText.trim());
    const name = heading?.innerText?.trim() || "";
    const hasBusinessDetails = document.querySelector('[data-item-id="address"], [data-item-id="authority"], [data-item-id^="phone:tel:"]');

    if (!name || (!location.pathname.includes("/place/") && !hasBusinessDetails)) return null;

    const address = stripLabel(getText([
      'button[data-item-id="address"]',
      '[data-item-id="address"]',
      'button[aria-label^="Dirección"]',
      'button[aria-label^="Address"]'
    ]));
    const phone = stripLabel(getText([
      'button[data-item-id^="phone:tel:"]',
      'button[data-item-id*="phone"]',
      'button[aria-label^="Teléfono"]',
      'button[aria-label^="Phone"]'
    ]));
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

  async function loadProspects() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    prospects = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
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
      :host{all:initial;color:#172033}*{box-sizing:border-box}.panel{background:#fff;border:1px solid #dbe3ef;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.24);overflow:hidden}.top{display:flex;align-items:center;gap:10px;padding:13px 14px;background:linear-gradient(135deg,#172554,#1d4ed8);color:#fff}.logo{display:grid;place-items:center;width:34px;height:34px;background:#fff2;border-radius:10px;font-size:18px}.heading{min-width:0;flex:1}.heading strong{display:block;font-size:14px}.heading span{display:block;opacity:.78;font-size:11px;margin-top:2px}.iconbtn{border:0;border-radius:8px;background:#fff1;color:#fff;cursor:pointer;padding:7px 9px;font-size:12px}.body{padding:15px}.empty{text-align:center;padding:20px 10px;color:#64748b}.empty b{display:block;color:#172033;margin-bottom:6px}.actions{display:flex;gap:8px;margin-top:12px}.btn{border:0;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer}.primary{background:#2563eb;color:white;flex:1}.secondary{background:#eef2ff;color:#1e3a8a}.danger{background:#fee2e2;color:#b91c1c}.fields{display:grid;gap:10px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.field label{display:block;color:#526074;font-size:11px;font-weight:700;margin-bottom:5px}.field input,.field select,.field textarea{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:9px 10px;background:#fff;color:#172033;font:13px/1.3 Arial,sans-serif;outline:none}.field input:focus,.field select:focus,.field textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px #dbeafe}.field textarea{min-height:76px;resize:vertical}.title{font-size:17px;font-weight:800;margin:0 0 3px;line-height:1.25}.address{font-size:12px;color:#64748b;margin:0 0 13px}.saved{display:none;color:#15803d;font-size:12px;font-weight:700;align-items:center}.saved.show{display:flex}.footer{display:flex;align-items:center;gap:8px;margin-top:12px}.footer .actions{margin:0 0 0 auto}.statusline{height:5px;background:var(--status,#64748b)}
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
          <button class="iconbtn" id="close" title="Desactivar">✕</button>
        </header>
        <div class="body empty"><b>Selecciona un negocio</b>Haz clic en cualquier ficha o resultado de Google Maps para abrir su registro.</div>
      </section>`;
    wireCommonActions();
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
          <button class="iconbtn" id="close" title="Desactivar">✕</button>
        </header>
        <form class="body" id="record-form">
          <h2 class="title">${escapeHtml(record.name)}</h2>
          <p class="address">${escapeHtml(record.address || "Dirección no detectada")}</p>
          <div class="fields">
            <div class="grid2">
              <div class="field"><label>Teléfono</label><input name="phone" value="${escapeHtml(record.phone || "")}" placeholder="+57..."></div>
              <div class="field"><label>Último contacto</label><input name="lastContact" type="date" value="${escapeHtml(record.lastContact || "")}"></div>
            </div>
            <div class="field"><label>Página web</label><input name="website" type="url" value="${escapeHtml(record.website || "")}" placeholder="https://..."></div>
            <div class="field"><label>Estado</label><select name="status">${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${record.status === key ? "selected" : ""}>${value.label}</option>`).join("")}</select></div>
            <div class="field"><label>Descripción / notas comerciales</label><textarea name="description" placeholder="Qué necesita, con quién hablaste, próxima acción...">${escapeHtml(record.description || "")}</textarea></div>
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
      const now = new Date().toISOString();
      const next = {
        ...record,
        ...place,
        id: existing?.id || crypto.randomUUID(),
        phone: data.get("phone").trim(),
        website: data.get("website").trim(),
        status: data.get("status"),
        description: data.get("description").trim(),
        lastContact: data.get("lastContact"),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      prospects = existing
        ? prospects.map((item) => item.id === existing.id ? next : item)
        : [...prospects, next];
      await chrome.storage.local.set({ [STORAGE_KEY]: prospects });
      currentPlace = next;
      renderPlace(next);
      const saved = shadow.querySelector("#saved");
      saved?.classList.add("show");
      setTimeout(() => saved?.classList.remove("show"), 1800);
      decorateVisibleResults();
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
    shadow.querySelector("#close")?.addEventListener("click", () => setActive(false));
    shadow.querySelector("#open-dashboard")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    });
  }

  function detectPlace() {
    if (!active) return;
    const place = extractSelectedPlace();
    if (!place) return;
    const key = `${placeKey(place)}|${place.mapUrl}`;
    if (key === lastDetectedKey) return;
    lastDetectedKey = key;
    currentPlace = place;
    renderPlace(place);
  }

  function scheduleDetection(delay = 650) {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(() => {
      detectPlace();
      decorateVisibleResults();
    }, delay);
  }

  function decorateVisibleResults() {
    document.querySelectorAll("[data-gmp-crm-status]").forEach((element) => {
      element.removeAttribute("data-gmp-crm-status");
      element.removeAttribute("data-gmp-crm-label");
      element.style.removeProperty("--gmp-crm-color");
    });
    document.querySelectorAll("[data-gmp-crm-map-marker]").forEach((element) => {
      element.removeAttribute("data-gmp-crm-map-marker");
      element.removeAttribute("title");
      element.style.removeProperty("--gmp-crm-color");
    });
    if (!active || !prospects.length) return;

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

    const namedMapElements = [...document.querySelectorAll('[role="button"][aria-label], [role="img"][aria-label]')];
    for (const element of namedMapElements) {
      const label = normalize(element.getAttribute("aria-label") || "");
      if (!label) continue;
      const record = prospects.find((item) => normalize(item.name) === label);
      if (!record) continue;
      const status = STATUS[record.status] || STATUS.unreviewed;
      element.setAttribute("data-gmp-crm-map-marker", record.status);
      element.setAttribute("title", `${record.name} · ${status.label}`);
      element.style.setProperty("--gmp-crm-color", status.color);
    }
  }

  function startWatching() {
    document.addEventListener("click", handleDocumentClick, true);
    observer = new MutationObserver(() => scheduleDetection(700));
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleDetection(100);
  }

  function stopWatching() {
    document.removeEventListener("click", handleDocumentClick, true);
    observer?.disconnect();
    observer = null;
    clearTimeout(detectTimer);
  }

  function handleDocumentClick(event) {
    if (rootHost?.contains(event.target)) return;
    scheduleDetection(450);
    setTimeout(detectPlace, 1300);
  }

  async function setActive(next) {
    active = next;
    if (active) {
      await loadProspects();
      buildShell();
      rootHost.style.display = "block";
      startWatching();
    } else {
      stopWatching();
      if (rootHost) rootHost.style.display = "none";
      decorateVisibleResults();
      lastDetectedKey = "";
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_CRM") setActive(!active);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      prospects = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
      decorateVisibleResults();
      if (currentPlace && active) renderPlace(currentPlace);
    }
  });
})();

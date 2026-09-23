const STORAGE_KEY = "prospects";
const STATUS = {
  unreviewed: { label: "Sin revisar", color: "#64748b" },
  pending: { label: "Pendiente", color: "#f59e0b" },
  contact: { label: "Por contactar", color: "#8b5cf6" },
  contacted: { label: "Contactado", color: "#3b82f6" },
  interested: { label: "Interesado", color: "#0891b2" },
  quoted: { label: "Cotización enviada", color: "#db2777" },
  client: { label: "Cliente", color: "#16a34a" },
  rejected: { label: "No interesado", color: "#dc2626" },
  blocked: { label: "No contactar", color: "#111827" }
};

let records = [];
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => value.toString().replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));
const normalize = (value = "") => value.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function initializeStatusOptions() {
  const filter = $("#status-filter");
  const editor = $("#editor-status");
  for (const [key, value] of Object.entries(STATUS)) {
    filter.insertAdjacentHTML("beforeend", `<option value="${key}">${value.label}</option>`);
    editor.insertAdjacentHTML("beforeend", `<option value="${key}">${value.label}</option>`);
  }
}

async function loadRecords() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  render();
}

async function saveRecords() {
  await chrome.storage.local.set({ [STORAGE_KEY]: records });
  render();
}

function filteredRecords() {
  const search = normalize($("#search").value);
  const status = $("#status-filter").value;
  const sort = $("#sort").value;
  const result = records.filter((record) => {
    const haystack = normalize([record.name, record.phone, record.website, record.address, record.description].join(" "));
    return (!search || haystack.includes(search)) && (!status || record.status === status);
  });

  return result.sort((a, b) => {
    if (sort === "name-asc") return (a.name || "").localeCompare(b.name || "", "es");
    if (sort === "status-asc") return (STATUS[a.status]?.label || "").localeCompare(STATUS[b.status]?.label || "", "es");
    if (sort === "created-desc") return (b.createdAt || "").localeCompare(a.createdAt || "");
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("es-CO", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function render() {
  const visible = filteredRecords();
  const body = $("#records-body");
  body.innerHTML = visible.map((record) => {
    const status = STATUS[record.status] || STATUS.unreviewed;
    const website = record.website
      ? `<a href="${escapeHtml(record.website)}" target="_blank" rel="noreferrer">${escapeHtml(record.website.replace(/^https?:\/\//, ""))}</a>`
      : "<span>Sin página web</span>";
    return `<tr data-id="${escapeHtml(record.id)}">
      <td class="business"><strong>${escapeHtml(record.name || "Sin nombre")}</strong><span title="${escapeHtml(record.address || "")}">${escapeHtml(record.address || "Sin dirección")}</span></td>
      <td class="contact">${record.phone ? `<a href="tel:${escapeHtml(record.phone)}">${escapeHtml(record.phone)}</a>` : "<span>Sin teléfono</span>"}${website}</td>
      <td><span class="status" style="--status-color:${status.color}">${status.label}</span></td>
      <td>${formatDate(record.lastContact)}</td>
      <td>${formatDate(record.updatedAt, true)}</td>
      <td><div class="row-actions">
        ${record.mapUrl ? `<a href="${escapeHtml(record.mapUrl)}" target="_blank" rel="noreferrer" title="Abrir en Maps">Mapa</a>` : ""}
        <button data-action="edit" title="Editar">Editar</button>
        <button data-action="delete" title="Eliminar">×</button>
      </div></td>
    </tr>`;
  }).join("");

  $("#empty-state").hidden = visible.length > 0;
  $("#result-count").textContent = `${visible.length} ${visible.length === 1 ? "registro" : "registros"}`;
  $("#stat-total").textContent = records.length;
  $("#stat-contact").textContent = records.filter((item) => ["pending", "contact"].includes(item.status)).length;
  $("#stat-active").textContent = records.filter((item) => ["contacted", "interested", "quoted"].includes(item.status)).length;
  $("#stat-client").textContent = records.filter((item) => item.status === "client").length;
}

function openEditor(record = null) {
  const form = $("#editor-form");
  form.reset();
  form.elements.id.value = record?.id || "";
  form.elements.name.value = record?.name || "";
  form.elements.phone.value = record?.phone || "";
  form.elements.website.value = record?.website || "";
  form.elements.address.value = record?.address || "";
  form.elements.status.value = record?.status || "unreviewed";
  form.elements.lastContact.value = record?.lastContact || "";
  form.elements.mapUrl.value = record?.mapUrl || "";
  form.elements.description.value = record?.description || "";
  $("#editor-title").textContent = record ? "Editar negocio" : "Nuevo negocio";
  $("#editor").showModal();
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function download(name, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const fields = [
    ["ID", "id"], ["Negocio", "name"], ["Telefono", "phone"], ["Pagina web", "website"],
    ["Direccion", "address"], ["Estado", "statusLabel"], ["Descripcion", "description"],
    ["Ultimo contacto", "lastContact"], ["URL Google Maps", "mapUrl"], ["Latitud", "latitude"],
    ["Longitud", "longitude"], ["Creado", "createdAt"], ["Actualizado", "updatedAt"]
  ];
  const rows = records.map((record) => fields.map(([, key]) => csvCell(
    key === "statusLabel" ? (STATUS[record.status]?.label || record.status) : record[key]
  )).join(","));
  const csv = `\uFEFF${fields.map(([label]) => csvCell(label)).join(",")}\r\n${rows.join("\r\n")}`;
  download(`prospectos-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  toast("CSV exportado. Puedes abrirlo en Excel o Google Sheets.");
}

function parseCsv(text) {
  const sample = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map(normalize);
  const aliases = {
    id: ["id"], name: ["negocio", "nombre", "name", "business"], phone: ["telefono", "numero", "phone"],
    website: ["pagina web", "web", "website", "sitio web"], address: ["direccion", "address"],
    status: ["estado", "status"], description: ["descripcion", "notas", "description", "notes"],
    lastContact: ["ultimo contacto", "last contact"], mapUrl: ["url google maps", "maps", "mapurl"],
    latitude: ["latitud", "latitude"], longitude: ["longitud", "longitude"], createdAt: ["creado", "created"], updatedAt: ["actualizado", "updated"]
  };
  const indexFor = (key) => headers.findIndex((header) => aliases[key].includes(header));
  return rows.map((values) => {
    const item = {};
    for (const key of Object.keys(aliases)) {
      const index = indexFor(key);
      if (index >= 0) item[key] = values[index]?.trim() || "";
    }
    const statusKey = Object.entries(STATUS).find(([key, value]) => normalize(item.status) === key || normalize(item.status) === normalize(value.label))?.[0];
    item.status = statusKey || "unreviewed";
    return item;
  }).filter((item) => item.name);
}

function mergeImported(imported) {
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  for (const raw of imported) {
    const item = {
      ...raw,
      id: raw.id || crypto.randomUUID(),
      name: raw.name?.trim() || "",
      status: STATUS[raw.status] ? raw.status : "unreviewed",
      createdAt: raw.createdAt || now,
      updatedAt: now
    };
    if (!item.name) continue;
    const key = normalize(`${item.name}|${item.address || ""}`);
    const index = records.findIndex((record) => record.id === item.id || normalize(`${record.name}|${record.address || ""}`) === key);
    if (index >= 0) { records[index] = { ...records[index], ...item, id: records[index].id }; updated += 1; }
    else { records.push(item); added += 1; }
  }
  return { added, updated };
}

$("#records-body").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest("tr").dataset.id;
  const record = records.find((item) => item.id === id);
  if (button.dataset.action === "edit") openEditor(record);
  if (button.dataset.action === "delete" && confirm(`¿Eliminar ${record.name}?`)) {
    records = records.filter((item) => item.id !== id);
    await saveRecords();
    toast("Registro eliminado.");
  }
});

$("#editor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id");
  const current = records.find((item) => item.id === id);
  const now = new Date().toISOString();
  const record = {
    ...current,
    id: id || crypto.randomUUID(),
    name: data.get("name").trim(),
    phone: data.get("phone").trim(),
    website: data.get("website").trim(),
    address: data.get("address").trim(),
    status: data.get("status"),
    lastContact: data.get("lastContact"),
    mapUrl: data.get("mapUrl").trim(),
    description: data.get("description").trim(),
    createdAt: current?.createdAt || now,
    updatedAt: now
  };
  records = current ? records.map((item) => item.id === id ? record : item) : [...records, record];
  await saveRecords();
  $("#editor").close();
  toast(current ? "Registro actualizado." : "Negocio agregado.");
});

$("#import-button").addEventListener("click", () => $("#file-input").click());
$("#file-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsv(text);
    if (!Array.isArray(imported)) throw new Error("El archivo no contiene una lista de registros.");
    const result = mergeImported(imported);
    await saveRecords();
    toast(`Importación terminada: ${result.added} nuevos y ${result.updated} actualizados.`);
  } catch (error) {
    alert(`No se pudo importar el archivo: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});

$("#export-csv").addEventListener("click", exportCsv);
$("#export-json").addEventListener("click", () => {
  download(`respaldo-prospectos-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(records, null, 2), "application/json");
  toast("Respaldo JSON exportado.");
});
$("#new-record").addEventListener("click", () => openEditor());
$("#close-editor").addEventListener("click", () => $("#editor").close());
$("#cancel-editor").addEventListener("click", () => $("#editor").close());
$("#clear-all").addEventListener("click", async () => {
  if (!records.length) return;
  if (confirm("¿Eliminar todos los registros? Antes puedes descargar un respaldo JSON.")) {
    records = [];
    await saveRecords();
    toast("La base local quedó vacía.");
  }
});
[$("#search"), $("#status-filter"), $("#sort")].forEach((element) => element.addEventListener("input", render));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    records = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
    render();
  }
});

initializeStatusOptions();
loadRecords();

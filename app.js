// Atomix webapp logic
const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
}

const API_BASE = ""; // тот же домен, что и сама страница (см. api.py: StaticFiles mount)

function apiHeaders() {
  const h = { "Content-Type": "application/json" };
  if (tg && tg.initData) h["X-Telegram-Init-Data"] = tg.initData;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...apiHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

let ELEMENTS = [];
let LANTHANIDE_RANGE = [57, 71];
let ACTINIDE_RANGE = [89, 103];
let CURRENT_USER = null;

const CATEGORY_LABELS = {
  alkali: "Щелочной металл",
  "alkaline-earth": "Щелочноземельный металл",
  transition: "Переходный металл",
  "post-transition": "Постпереходный металл",
  metalloid: "Металлоид",
  nonmetal: "Неметалл",
  halogen: "Галоген",
  "noble-gas": "Благородный газ",
  lanthanide: "Лантаноид",
  actinide: "Актиноид",
  unknown: "Свойства неизвестны",
};

const PHASE_LABELS = { gas: "Газ", liquid: "Жидкость", solid: "Твёрдое", unknown: "Неизвестно" };

// ---------------- Tabs ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab + "-view").classList.add("active");
  });
});

// ---------------- Periodic table ----------------
function renderPeriodicTable(filterText = "") {
  const container = document.getElementById("periodic-table");
  container.innerHTML = "";
  const q = filterText.trim().toLowerCase();

  ELEMENTS.forEach((el) => {
    const cell = document.createElement("div");
    cell.className = `el-cell cat-${el.category}`;
    cell.style.gridColumn = el.group;
    cell.style.gridRow = el.period;
    cell.innerHTML = `<div class="num">${el.number}</div><div class="sym">${el.symbol}</div><div class="name">${el.name_ru}</div>`;

    const matches =
      !q ||
      el.name_ru.toLowerCase().includes(q) ||
      el.name_en.toLowerCase().includes(q) ||
      el.symbol.toLowerCase().includes(q) ||
      String(el.number) === q;
    if (!matches) cell.classList.add("dim");

    cell.addEventListener("click", () => openElementModal(el));
    container.appendChild(cell);
  });

  // Метки-заглушки для f-блока в основной таблице
  addMarker(container, 6, 3, `${LANTHANIDE_RANGE[0]}-${LANTHANIDE_RANGE[1]}`);
  addMarker(container, 7, 3, `${ACTINIDE_RANGE[0]}-${ACTINIDE_RANGE[1]}`);
}

function addMarker(container, row, col, label) {
  const marker = document.createElement("div");
  marker.className = "el-cell marker";
  marker.style.gridColumn = col;
  marker.style.gridRow = row;
  marker.textContent = label;
  container.appendChild(marker);
}

function openElementModal(el) {
  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <div class="el-big-symbol cat-${el.category}" style="width:64px;height:64px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#08101f;">${el.symbol}</div>
    <div class="el-title">${el.name_ru} <span style="color:var(--hint);font-weight:400;">(${el.name_en})</span></div>
    <div class="el-sub">Атомный номер ${el.number}</div>
    <div class="el-props">
      <div class="el-prop"><div class="label">Масса</div><div class="value">${el.mass}</div></div>
      <div class="el-prop"><div class="label">Категория</div><div class="value">${CATEGORY_LABELS[el.category] || el.category}</div></div>
      <div class="el-prop"><div class="label">Период</div><div class="value">${el.period <= 7 ? el.period : (el.period === 9 ? 6 : 7)}</div></div>
      <div class="el-prop"><div class="label">Агрегатное состояние</div><div class="value">${PHASE_LABELS[el.phase] || el.phase}</div></div>
    </div>
  `;
  showModal("element-modal");
}

document.getElementById("search-input").addEventListener("input", (e) => {
  renderPeriodicTable(e.target.value);
});

// ---------------- Custom (community) elements ----------------
let CUSTOM_ELEMENTS = [];
let USERS = [];

function renderCustomElements(filterUserId = "") {
  const grid = document.getElementById("custom-elements-grid");
  grid.innerHTML = "";
  const list = filterUserId
    ? CUSTOM_ELEMENTS.filter((c) => String(c.creator_telegram_id) === String(filterUserId))
    : CUSTOM_ELEMENTS;

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state">Пока никто не придумал элемент. Стань первым! ⚛️</div>`;
    return;
  }

  list.forEach((c) => {
    const card = document.createElement("div");
    card.className = "custom-card";
    card.style.borderLeftColor = c.color || "#8e6bff";
    card.innerHTML = `
      <div class="sym">${c.symbol}</div>
      <div class="name">${c.name}</div>
      <div class="author">от @${c.creator_username || "аноним"}</div>
    `;
    card.addEventListener("click", () => openCustomModal(c));
    grid.appendChild(card);
  });
}

function openCustomModal(c) {
  const body = document.getElementById("modal-body");
  const canDelete = CURRENT_USER && CURRENT_USER.telegram_id === c.creator_telegram_id;
  body.innerHTML = `
    <div class="el-big-symbol" style="width:64px;height:64px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${c.color};color:#fff;">${c.symbol}</div>
    <div class="el-title">${c.name}</div>
    <div class="el-sub">Автор: @${c.creator_username || "аноним"} · ${c.category || "custom"}</div>
    <p style="font-size:14px;line-height:1.4;">${c.description ? c.description : "Описание не указано."}</p>
    ${canDelete ? `<button id="delete-custom-btn" class="primary-btn" style="background:#e05353;">Удалить</button>` : ""}
  `;
  if (canDelete) {
    document.getElementById("delete-custom-btn").addEventListener("click", async () => {
      try {
        await api(`/api/custom-elements/${c.id}`, { method: "DELETE" });
        closeModals();
        await loadCustomElements();
      } catch (err) {
        alert("Не удалось удалить: " + err.message);
      }
    });
  }
  showModal("element-modal");
}

document.getElementById("user-filter").addEventListener("change", (e) => {
  renderCustomElements(e.target.value);
});

function renderUserFilter() {
  const select = document.getElementById("user-filter");
  select.innerHTML = `<option value="">Все пользователи</option>`;
  USERS.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.telegram_id;
    opt.textContent = `@${u.username || u.first_name || "аноним"} (${u.elements_count})`;
    select.appendChild(opt);
  });
}

// ---------------- Create element modal ----------------
document.getElementById("add-element-btn").addEventListener("click", () => showModal("create-modal"));

document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    symbol: document.getElementById("f-symbol").value,
    name: document.getElementById("f-name").value,
    description: document.getElementById("f-description").value,
    category: document.getElementById("f-category").value || "custom",
    color: document.getElementById("f-color").value,
  };
  try {
    await api("/api/custom-elements", { method: "POST", body: JSON.stringify(payload) });
    closeModals();
    e.target.reset();
    await loadCustomElements();
    await loadUsers();
    if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred("success");
  } catch (err) {
    alert("Не удалось создать элемент: " + err.message);
  }
});

// ---------------- Modal helpers ----------------
function showModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
}
document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", closeModals));
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModals();
  });
});

// ---------------- Data loading ----------------
async function loadElements() {
  const data = await api("/api/elements");
  ELEMENTS = data.elements;
  LANTHANIDE_RANGE = data.lanthanide_range;
  ACTINIDE_RANGE = data.actinide_range;
  renderPeriodicTable();
}

async function loadCustomElements() {
  CUSTOM_ELEMENTS = await api("/api/custom-elements");
  renderCustomElements(document.getElementById("user-filter").value);
}

async function loadUsers() {
  USERS = await api("/api/users");
  renderUserFilter();
}

async function loadMe() {
  try {
    CURRENT_USER = await api("/api/me");
  } catch (e) {
    CURRENT_USER = null;
  }
}

(async function init() {
  await Promise.all([loadElements(), loadMe(), loadCustomElements(), loadUsers()]);
})();

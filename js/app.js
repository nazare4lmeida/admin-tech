/**
 * app.js — Main controller v3
 */
(function () {
  "use strict";

  // ============================================================
  // TOAST
  // ============================================================
  window.toast = function (msg, type = "info") {
    const container = document.getElementById("toastContainer");
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = `<span>${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span> ${msg}`;
    container.appendChild(t);
    setTimeout(() => {
      t.style.animation = "toastOut 0.3s ease forwards";
      setTimeout(() => t.remove(), 300);
    }, 3500);
  };

  // ============================================================
  // PAGES
  // ============================================================
  const loginPage = document.getElementById("loginPage");
  const appPage   = document.getElementById("appPage");

  function showLogin() {
    loginPage.classList.remove("hidden");
    appPage.classList.add("hidden");
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginCode").value = "";
    document.getElementById("loginError").classList.add("hidden");
  }

  async function showApp() {
    loginPage.classList.add("hidden");
    appPage.classList.remove("hidden");
    updateSupabaseIndicator();
    await Table.updateAllBadges();
    switchFormation("fullstack");
    startRealtime();
  }

  // ============================================================
  // VIEWS — tabela vs relatório
  // ============================================================
  const tableView  = document.getElementById("tableView");
  const reportView = document.getElementById("reportView");
  let _activeView  = "table";

  function showTableView() {
    _activeView = "table";
    tableView.classList.remove("hidden-view");
    reportView.classList.remove("active");
    document.getElementById("btnReport")?.classList.remove("active");
    document.querySelectorAll(".nav-item[data-formation]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.formation === _activeFormation);
    });
  }

  function showReportView() {
    _activeView = "report";
    tableView.classList.add("hidden-view");
    reportView.classList.add("active");
    document.querySelectorAll(".nav-item[data-formation]").forEach(btn => btn.classList.remove("active"));
    document.getElementById("btnReport")?.classList.add("active");
    Report.render();
    closeSidebar();
  }

  // ============================================================
  // SUPABASE STATUS
  // ============================================================
  function updateSupabaseIndicator() {
    const el = document.getElementById("supabaseStatus");
    if (!el) return;
    if (window.SB && SB.enabled()) {
      el.textContent = "🟢 Supabase conectado";
      el.style.color = "var(--green)";
    } else {
      el.textContent = "🟡 Modo local (localStorage)";
      el.style.color = "#f59e0b";
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  document.getElementById("btnLogin").addEventListener("click", handleLogin);
  document.getElementById("loginCode").addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
  document.getElementById("loginEmail").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("loginCode").focus(); });
  document.getElementById("togglePw").addEventListener("click", () => {
    const inp = document.getElementById("loginCode");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  function handleLogin() {
    const email = document.getElementById("loginEmail").value;
    const code  = document.getElementById("loginCode").value;
    const errEl = document.getElementById("loginError");
    errEl.classList.add("hidden");
    if (Auth.login(email, code)) {
      showApp();
    } else {
      errEl.classList.remove("hidden");
      document.getElementById("loginCode").value = "";
    }
  }

  document.getElementById("btnLogout").addEventListener("click", () => {
    stopRealtime();
    Auth.logout();
    showLogin();
    toast("Sessão encerrada.", "info");
  });

  // ============================================================
  // FORMATION NAV
  // ============================================================
  let _activeFormation = "fullstack";

  function switchFormation(id) {
    _activeFormation = id;
    showTableView();
    document.querySelectorAll(".nav-item[data-formation]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.formation === id);
    });
    Table.render(id);
    closeSidebar();
  }

  document.querySelectorAll(".nav-item[data-formation]").forEach(btn => {
    btn.addEventListener("click", () => switchFormation(btn.dataset.formation));
  });

  // Relatório
  document.getElementById("btnReport").addEventListener("click", showReportView);
  document.getElementById("btnRefreshReport")?.addEventListener("click", () => Report.render());
  document.getElementById("menuBtnReport")?.addEventListener("click", openSidebar);
  document.getElementById("btnPrintReport")?.addEventListener("click", () => window.print());

  // ============================================================
  // SIDEBAR
  // ============================================================
  const sidebar = document.getElementById("sidebar");
  let overlay;

  function openSidebar() {
    sidebar.classList.add("open");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      document.body.appendChild(overlay);
      overlay.addEventListener("click", closeSidebar);
    }
    overlay.classList.add("show");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  }

  window.closeSidebar = closeSidebar;
  document.getElementById("menuBtn").addEventListener("click", openSidebar);
  document.getElementById("sidebarToggle").addEventListener("click", closeSidebar);
  document.getElementById("btnCollapseSidebar").addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("gt_sidebar_collapsed", collapsed ? "1" : "0");
  });
  if (localStorage.getItem("gt_sidebar_collapsed") === "1") {
    sidebar.classList.add("collapsed");
  }

  // ============================================================
  // ADD STUDENT
  // ============================================================
  document.getElementById("btnAddStudent").addEventListener("click", async () => {
    try {
      showTableView();
      await GT.addStudent(_activeFormation, "");
      await Table.render(_activeFormation);
      closeSidebar();
      const scroll = document.getElementById("tableScroll");
      scroll.scrollTop = scroll.scrollHeight;
    } catch (err) {
      toast("Erro ao adicionar aluno: " + err.message, "error");
    }
  });

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================
  document.getElementById("btnImport").addEventListener("click", () => {
    document.getElementById("fileInput").click();
    closeSidebar();
  });
  document.getElementById("fileInput").addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    IO.doImport(file, _activeFormation);
    this.value = "";
  });
  document.getElementById("btnExport").addEventListener("click", () => {
    IO.openExportModal(_activeFormation);
    closeSidebar();
  });

  // ============================================================
  // SEARCH & FILTER
  // ============================================================
  document.getElementById("searchInput").addEventListener("input", e => Table.setSearch(e.target.value));
  document.getElementById("filterStatus").addEventListener("change", e => Table.setFilter(e.target.value));

  // ============================================================
  // BULK DELETE
  // ============================================================
  document.getElementById("btnBulkDelete").addEventListener("click", async () => {
    const ids = Table.getSelectedIds();
    if (ids.length === 0) return;
    const confirmed = confirm(`Excluir ${ids.length} aluno(s) selecionado(s)?\n\nEssa ação não pode ser desfeita.`);
    if (!confirmed) return;
    try {
      await GT.deleteMultiple(_activeFormation, ids);
      toast(`${ids.length} aluno(s) excluído(s).`, "success");
      await Table.render(_activeFormation);
      await Table.updateAllBadges();
    } catch (err) {
      toast("Erro ao excluir: " + err.message, "error");
    }
  });

  document.getElementById("btnCancelSelection").addEventListener("click", () => {
    Table.render(_activeFormation);
  });

  // ============================================================
  // SMART FILL
  // ============================================================
  let _fillAssistantEnabled = false;

  const fillToggle = document.getElementById("fillAssistantToggle");
  if (fillToggle) {
    fillToggle.addEventListener("change", () => {
      _fillAssistantEnabled = fillToggle.checked;
      Table.setFillMode(_fillAssistantEnabled);
      const hint = document.querySelector(".fill-hint");
      if (hint) hint.style.opacity = _fillAssistantEnabled ? "1" : "0.5";
      const fillBtn = document.getElementById("btnBulkFill");
      if (fillBtn) fillBtn.style.display = _fillAssistantEnabled ? "inline-flex" : "none";
    });
  }

  const btnBulkFill = document.getElementById("btnBulkFill");
  if (btnBulkFill) {
    btnBulkFill.addEventListener("click", () => {
      const ids = Table.getSelectedIds();
      if (ids.length === 0) return;
      SmartFill.openModal(null, ids, _activeFormation);
    });
  }

  window.getActiveFormation = () => _activeFormation;

  // ============================================================
  // THEME — funciona nas duas views
  // ============================================================
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gt_theme", theme);
    const label = theme === "dark" ? "☀️ Tema" : "🌙 Tema";
    const btn1 = document.getElementById("themeToggle");
    const btn2 = document.getElementById("themeToggleReport");
    if (btn1) btn1.textContent = label;
    if (btn2) btn2.textContent = label;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const saved = localStorage.getItem("gt_theme") || "dark";
    applyTheme(saved);
    document.getElementById("themeToggle")?.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
    document.getElementById("themeToggleReport")?.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  });

  // ============================================================
  // REALTIME
  // ============================================================
  const _wsConnections = [];

  function startRealtime() {
    if (!window.SB || !SB.enabled()) return;
    const tables = [
      { table: "alunos_fullstack",      fid: "fullstack" },
      { table: "alunos_ia_generativa",  fid: "ia-generativa" },
      { table: "alunos_ia_soft_skills", fid: "ia-soft-skills" },
    ];
    const wsUrl = SB._url.replace("https://", "wss://") + `/realtime/v1/websocket?apikey=${SB._key}&vsn=1.0.0`;
    tables.forEach(({ table, fid }) => startRealtimeForTable(table, fid, wsUrl));
  }

  function startRealtimeForTable(table, fid, wsUrl) {
    const ws = new WebSocket(wsUrl);
    _wsConnections.push(ws);
    ws.onopen = () => ws.send(JSON.stringify({
      topic: `realtime:public:${table}`, event: "phx_join", payload: {}, ref: "1"
    }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (["INSERT","UPDATE","DELETE"].includes(msg.payload?.type)) {
        if (fid === _activeFormation && _activeView === "table") Table.render(_activeFormation);
        Table.updateBadge(fid);
      }
    };
    ws.onerror = err => console.warn("Realtime WS error:", err);
    ws.onclose = () => {
      setTimeout(() => { if (Auth.isLoggedIn()) startRealtimeForTable(table, fid, wsUrl); }, 3000);
    };
  }

  function stopRealtime() {
    _wsConnections.forEach(ws => ws.close());
    _wsConnections.length = 0;
  }

  // ============================================================
  // INIT
  // ============================================================
  if (Auth.isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }
})();
  // ============================================================
  // COMPACT MODE TOGGLE
  // ============================================================
  (function () {
    let _compactEnabled = localStorage.getItem("gt_compact") === "1";
    function applyCompact(enabled) {
      _compactEnabled = enabled;
      localStorage.setItem("gt_compact", enabled ? "1" : "0");
      Table.setCompactMode(enabled);
      const btn = document.getElementById("btnCompactToggle");
      if (btn) btn.textContent = enabled ? "⊞ Expandir" : "⊟ Compacto";
    }
    document.addEventListener("DOMContentLoaded", () => {
      document.getElementById("btnCompactToggle")?.addEventListener("click", () => {
        applyCompact(!_compactEnabled);
      });
      // Restaura preferência salva
      if (_compactEnabled) {
        Table.setCompactMode(true);
        const btn = document.getElementById("btnCompactToggle");
        if (btn) btn.textContent = "⊞ Expandir";
      }
    });
  })();

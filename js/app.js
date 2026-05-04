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
  const appPage = document.getElementById("appPage");

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
    // Load dynamic formations before rendering sidebar
    await GT.loadDynamicFormations();
    renderSidebarFormations();
    await Table.updateAllBadges();
    const hashId = window.location.hash.replace("#", "");
    const validId = GT.FORMATIONS.find((f) => f.id === hashId);
    if (hashId === "dashboard" || !hashId) {
      showDashboardView();
    } else {
      switchFormation(validId ? hashId : "fullstack");
    }
    startRealtime();
  }

  // ── Render sidebar formation nav dynamically ──────────────────
  function renderSidebarFormations() {
    const nav = document.getElementById("formationNav");
    if (!nav) return;
    nav.innerHTML = "";
    GT.FORMATIONS.forEach((f) => {
      const btn = document.createElement("button");
      btn.className = "nav-item" + (f.id === _activeFormation ? " active" : "");
      btn.dataset.formation = f.id;
      btn.innerHTML = `<span class="nav-icon">${f.icon}</span><span>${f.label}</span><span class="nav-badge" id="badge-${f.id}">0</span>`;
      btn.addEventListener("click", () => switchFormation(f.id));
      nav.appendChild(btn);
    });
  }

  // ============================================================
  // VIEWS — tabela vs relatório
  // ============================================================
  const tableView = document.getElementById("tableView");
  const reportView = document.getElementById("reportView");
  let _activeView = "table";

  function showTableView() {
    _activeView = "table";
    tableView.classList.remove("hidden-view");
    reportView.classList.remove("active");
    document.getElementById("btnReport")?.classList.remove("active");
    document.querySelectorAll(".nav-item[data-formation]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.formation === _activeFormation,
      );
    });
  }

  function showReportView() {
    _activeView = "report";
    tableView.classList.add("hidden-view");
    reportView.classList.add("active");
    const dv = document.getElementById("dashboardView");
    if (dv) dv.style.display = "none";
    document
      .querySelectorAll(".nav-item[data-formation]")
      .forEach((btn) => btn.classList.remove("active"));
    document.getElementById("btnReport")?.classList.add("active");
    document.getElementById("btnDashboard")?.classList.remove("active");
    Report.render();
    closeSidebar();
  }

  function showDashboardView() {
    _activeView = "dashboard";
    tableView.classList.add("hidden-view");
    reportView.classList.remove("active");
    const dv = document.getElementById("dashboardView");
    if (dv) dv.style.display = "";
    document.querySelectorAll(".nav-item[data-formation]").forEach(btn => btn.classList.remove("active"));
    document.getElementById("btnReport")?.classList.remove("active");
    document.getElementById("btnDashboard")?.classList.add("active");
    Dashboard.render();
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
  document.getElementById("loginCode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  document.getElementById("loginEmail").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("loginCode").focus();
  });
  document.getElementById("togglePw").addEventListener("click", () => {
    const inp = document.getElementById("loginCode");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  function handleLogin() {
    const email = document.getElementById("loginEmail").value;
    const code = document.getElementById("loginCode").value;
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
    window.location.hash = id;
    const dv = document.getElementById("dashboardView");
    if (dv) dv.style.display = "none";
    showTableView();
    document.querySelectorAll(".nav-item[data-formation]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.formation === id);
    });
    Table.render(id);
    closeSidebar();
  }

  // Relatório
  document
    .getElementById("btnReport")
    .addEventListener("click", showReportView);

  // ── Nova Turma ────────────────────────────────────────────────
  document
    .getElementById("btnNewFormation")
    ?.addEventListener("click", openNewFormationModal);

  function openNewFormationModal() {
    const existing = document.getElementById("newFormationOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "newFormationOverlay";
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:440px">
        <button class="modal-close" id="nfClose">✕</button>
        <div class="modal-header">
          <div class="modal-icon">📚</div>
          <div class="modal-title-wrap">
            <div class="modal-title">Nova Turma</div>
            <div class="modal-subtitle">Crie uma nova formação no sistema</div>
          </div>
        </div>
        <div class="modal-fields">
          <div class="modal-field">
            <label>Nome da Turma</label>
            <input type="text" id="nfLabel" placeholder="Ex: Presencial IA Gen - Aldeota" />
          </div>
          <div class="modal-field">
            <label>Ícone (emoji)</label>
            <input type="text" id="nfIcon" placeholder="🏫" value="🏫" maxlength="4" />
          </div>
          <div class="modal-field">
            <label>Cor (hex)</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="color" id="nfColorPicker" value="#6366f1" style="width:40px;height:36px;border:none;cursor:pointer;border-radius:6px;padding:2px" />
              <input type="text" id="nfColor" value="#6366f1" placeholder="#6366f1" style="flex:1" />
            </div>
          </div>
          <div class="modal-field">
            <label>Tipo</label>
            <select id="nfTipo">
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
            </select>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text3);padding:0 4px;margin-top:4px;line-height:1.5">
          ⚠️ Após criar, execute o SQL gerado no Supabase para criar a tabela da turma.
        </p>
        <div class="modal-actions">
          <button class="btn-modal-cancel" id="nfCancel">Cancelar</button>
          <button class="btn-modal-apply" id="nfConfirm">✓ Criar Turma</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Sync color picker ↔ text
    const picker = document.getElementById("nfColorPicker");
    const colorTxt = document.getElementById("nfColor");
    picker.addEventListener("input", () => {
      colorTxt.value = picker.value;
    });
    colorTxt.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(colorTxt.value)) picker.value = colorTxt.value;
    });

    const close = () => overlay.remove();
    document.getElementById("nfClose").onclick = close;
    document.getElementById("nfCancel").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById("nfConfirm").onclick = async () => {
      const label = document.getElementById("nfLabel").value.trim();
      if (!label) {
        toast("Digite o nome da turma.", "error");
        return;
      }
      const icon = document.getElementById("nfIcon").value.trim() || "📚";
      const color =
        document.getElementById("nfColor").value.trim() || "#6366f1";
      try {
        const id = await GT.createDynamicFormation({ label, icon, color });
        const tableName =
          "alunos_" + id.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const sql = `CREATE TABLE IF NOT EXISTS public.${tableName} (\n  id TEXT PRIMARY KEY,\n  nome TEXT NOT NULL DEFAULT '',\n  formacao TEXT NOT NULL DEFAULT '${id}',\n  sede TEXT,\n  presenca_final_plat NUMERIC(5,1),\n  nota_projeto_final NUMERIC(4,1),\n  progresso_curso NUMERIC(5,1),\n  status_importado TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "allow_all_${id}" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);`;
        close();
        renderSidebarFormations();
        await Table.updateAllBadges();
        // Show SQL to copy
        const sqlOverlay = document.createElement("div");
        sqlOverlay.className = "modal-overlay";
        sqlOverlay.innerHTML = `
          <div class="modal-box" style="max-width:560px">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div class="modal-header">
              <div class="modal-icon">✅</div>
              <div class="modal-title-wrap">
                <div class="modal-title">Turma criada!</div>
                <div class="modal-subtitle">Execute o SQL abaixo no Supabase SQL Editor</div>
              </div>
            </div>
            <textarea readonly style="width:100%;height:180px;font-family:monospace;font-size:11px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px;color:var(--text1);resize:none">${sql}</textarea>
            <div class="modal-actions">
              <button class="btn-modal-apply" onclick="navigator.clipboard.writeText(document.querySelector('textarea').value);toast('SQL copiado!','success')">📋 Copiar SQL</button>
              <button class="btn-modal-cancel" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
            </div>
          </div>`;
        document.body.appendChild(sqlOverlay);
        toast(`Turma "${label}" criada!`, "success");
      } catch (err) {
        toast("Erro ao criar turma: " + err.message, "error");
      }
    };
    closeSidebar();
  }
  document
    .getElementById("btnRefreshReport")
    ?.addEventListener("click", () => Report.render());
  document
    .getElementById("menuBtnReport")
    ?.addEventListener("click", openSidebar);
  document.getElementById("btnPrintReport")?.addEventListener("click", () => {
    // Delegado ao report.js via evento customizado
    document.dispatchEvent(new CustomEvent("gt:printReport"));
  });

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
  document
    .getElementById("sidebarToggle")
    .addEventListener("click", closeSidebar);
  document
    .getElementById("btnCollapseSidebar")
    .addEventListener("click", () => {
      const collapsed = sidebar.classList.toggle("collapsed");
      localStorage.setItem("gt_sidebar_collapsed", collapsed ? "1" : "0");
    });
  if (localStorage.getItem("gt_sidebar_collapsed") === "1") {
    sidebar.classList.add("collapsed");
  }

  // ============================================================
  // ADD STUDENT
  // ============================================================
  document
    .getElementById("btnAddStudent")
    .addEventListener("click", async () => {
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
  document
    .getElementById("searchInput")
    .addEventListener("input", (e) => Table.setSearch(e.target.value));
  document
    .getElementById("filterStatus")
    .addEventListener("change", (e) => Table.setFilter(e.target.value));

  // ============================================================
  // BULK DELETE
  // ============================================================
  document
    .getElementById("btnBulkDelete")
    .addEventListener("click", async () => {
      const ids = Table.getSelectedIds();
      if (ids.length === 0) return;
      const confirmed = confirm(
        `Excluir ${ids.length} aluno(s) selecionado(s)?\n\nEssa ação não pode ser desfeita.`,
      );
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

  document
    .getElementById("btnCancelSelection")
    .addEventListener("click", () => {
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
      if (fillBtn)
        fillBtn.style.display = _fillAssistantEnabled ? "inline-flex" : "none";
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
      const current =
        document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
    document
      .getElementById("themeToggleReport")
      ?.addEventListener("click", () => {
        const current =
          document.documentElement.getAttribute("data-theme") || "dark";
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
      { table: "alunos_fullstack", fid: "fullstack" },
      { table: "alunos_ia_generativa", fid: "ia-generativa" },
      { table: "alunos_ia_soft_skills", fid: "ia-soft-skills" },
    ];
    const wsUrl =
      SB._url.replace("https://", "wss://") +
      `/realtime/v1/websocket?apikey=${SB._key}&vsn=1.0.0`;
    tables.forEach(({ table, fid }) =>
      startRealtimeForTable(table, fid, wsUrl),
    );
  }

  function startRealtimeForTable(table, fid, wsUrl) {
    const ws = new WebSocket(wsUrl);
    _wsConnections.push(ws);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          topic: `realtime:public:${table}`,
          event: "phx_join",
          payload: {},
          ref: "1",
        }),
      );
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (["INSERT", "UPDATE", "DELETE"].includes(msg.payload?.type)) {
        if (fid === _activeFormation && _activeView === "table")
          Table.render(_activeFormation);
        Table.updateBadge(fid);
      }
    };
    ws.onerror = (err) => console.warn("Realtime WS error:", err);
    ws.onclose = () => {
      setTimeout(() => {
        if (Auth.isLoggedIn()) startRealtimeForTable(table, fid, wsUrl);
      }, 3000);
    };
  }

  function stopRealtime() {
    _wsConnections.forEach((ws) => ws.close());
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
    document
      .getElementById("btnCompactToggle")
      ?.addEventListener("click", () => {
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

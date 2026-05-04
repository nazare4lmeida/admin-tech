/**
 * certificados.js — Gerenciamento de Alunos para Envio de Certificados
 * Tabela independente: alunos_certificados
 * - Importar do Sistema: puxa alunos com conclusão/participação das tabelas existentes (só leitura)
 * - Importar planilha .xlsx de inscrições
 * - Todos os campos editáveis direto na tabela
 * - Exporta .xlsx e .html
 */

(function () {
  "use strict";

  const TABLE = "alunos_certificados";

  // ── Supabase helpers ──────────────────────────────────────────
  function getUrl() {
    return window.ENV?.SUPABASE_URL || "";
  }
  function getKey() {
    return window.ENV?.SUPABASE_ANON_KEY || "";
  }
  function getAuth() {
    return window.Auth?.getToken?.() || getKey();
  }

  async function sbFetch(path, options = {}) {
    const res = await fetch(getUrl() + "/rest/v1" + path, {
      method: options.method || "GET",
      headers: {
        apikey: getKey(),
        Authorization: "Bearer " + getAuth(),
        "Content-Type": "application/json",
        Prefer: options.prefer || "return=representation",
      },
      body: options.body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || res.statusText);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function getAll() {
    return (await sbFetch(`/${TABLE}?order=nome.asc`)) || [];
  }

  async function upsert(row) {
    return sbFetch(`/${TABLE}`, {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(row),
    });
  }

  async function patchField(id, col, value) {
    const body = {};
    body[col] = value === "" ? null : value;
    return sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify(body),
    });
  }

  async function patchRow(id, fields) {
    return sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify(fields),
    });
  }

  async function deleteRow(id) {
    return sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }

  // ── Normalização ──────────────────────────────────────────────
  function normalizar(str) {
    return (str || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ");
  }

  function normalizeHeader(str) {
    return normalizar(str).replace(/\s+/g, "_");
  }

  // ── IMPORTAR DO SISTEMA ───────────────────────────────────────
  // Lê todas as formações, filtra aprovado/participação, insere em alunos_certificados
  // NÃO altera nenhuma tabela original

  async function importarDoSistema() {
    if (!window.GT) {
      toast("Sistema não inicializado.", "error");
      return;
    }

    toast("Buscando alunos elegíveis...", "info");

    const existing = await getAll();
    let added = 0,
      updated = 0;

    for (const f of GT.FORMATIONS) {
      let students = [];
      try {
        students = await GT.getStudents(f.id);
      } catch {
        continue;
      }

      for (const s of students) {
        const statusObj = GT.calcStatus(s);
        const statusKey = s.statusManual || statusObj.key;

        // Só conclusão e participação
        if (statusKey !== "aprovado" && statusKey !== "participacao") continue;

        const nome = (s.nome || "").trim();
        if (!nome) continue;

        const rankInfo = window._rankMapForModal?.get(s.id);
        const medalha = s.medalhaManual || rankInfo?.medalha || null;
        const nota = GT.calcNotaMedia(s);
        const freq = parseFloat(s.presencaFinalPlat) || null;

        const certLabel =
          statusKey === "aprovado"
            ? "Certificado de Conclusão"
            : "Certificado de Participação";

        // Verifica se já existe pelo nome normalizado
        const existing_row = existing.find(
          (e) => normalizar(e.nome) === normalizar(nome),
        );

        if (existing_row) {
          // Atualiza apenas campos do sistema — preserva CPF, email, cidade, modalidade que já tiver
          const updates = {
            formacao: f.label,
            nota_final: nota ?? existing_row.nota_final ?? null,
            frequencia: freq ?? existing_row.frequencia ?? null,
            status: statusObj.label,
            certificado: existing_row.certificado || certLabel,
            medalha: existing_row.medalha || medalha || null,
          };
          await patchRow(existing_row.id, updates);
          // Atualiza cache local
          Object.assign(existing_row, updates);
          updated++;
        } else {
          const newRow = {
            id:
              "cert_" +
              Date.now() +
              "_" +
              Math.random().toString(36).slice(2, 6),
            nome,
            cpf: null,
            email: null,
            cidade: null,
            modalidade: f.presencial ? "Presencial" : "Online",
            formacao: f.label,
            nota_final: nota ?? null,
            frequencia: freq ?? null,
            status: statusObj.label,
            certificado: certLabel,
            medalha: medalha || null,
          };
          await upsert(newRow);
          existing.push(newRow);
          added++;
        }
      }
    }

    toast(
      `✅ ${added} novo(s), ${updated} atualizado(s) — apenas conclusão e participação.`,
      "success",
    );
    await render();
  }

  // ── IMPORTAR PLANILHA ─────────────────────────────────────────
  const COL_MAP_CERT = {
    cpf: ["cpf"],
    email: ["email"],
    nome: ["nome_completo", "nome"],
    cidade: ["cidade"],
    modalidade: ["modalidade"],
    formacao: ["curso_interesse", "curso", "formacao", "curso_formacao"],
    nota_final: ["nota_final", "nota"],
    frequencia: ["frequencia", "frequencia_percent", "presenca_final_plat"],
    status: ["status_geral", "status", "situacao"],
    certificado: ["certificado", "tipo_certificado"],
    medalha: ["medalha"],
  };

  function mapRow(rawRow) {
    const mapped = {};
    Object.keys(rawRow).forEach((col) => {
      const norm = normalizeHeader(col);
      for (const [field, aliases] of Object.entries(COL_MAP_CERT)) {
        if (aliases.includes(norm) && mapped[field] === undefined) {
          mapped[field] = rawRow[col];
        }
      }
    });
    return mapped;
  }

  async function importarPlanilha(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

          if (!rows.length) {
            toast("Planilha vazia.", "error");
            return;
          }

          let added = 0,
            updated = 0,
            skipped = 0;
          const existing = await getAll();

          const normPct = (v) => {
            const n = parseFloat(v);
            if (isNaN(n)) return null;
            return n > 0 && n <= 1 ? Math.round(n * 1000) / 10 : n;
          };

          for (const raw of rows) {
            const m = mapRow(raw);
            const nome = (m.nome || "").toString().trim();
            if (!nome) {
              skipped++;
              continue;
            }

            const match = existing.find(
              (e) => normalizar(e.nome) === normalizar(nome),
            );

            const row = {
              id:
                match?.id ||
                "cert_" +
                  Date.now() +
                  "_" +
                  Math.random().toString(36).slice(2, 6),
              nome,
              cpf: (m.cpf || "").toString().trim() || match?.cpf || null,
              email: (m.email || "").toString().trim() || match?.email || null,
              cidade:
                (m.cidade || "").toString().trim() || match?.cidade || null,
              modalidade:
                (m.modalidade || "").toString().trim() ||
                match?.modalidade ||
                null,
              formacao:
                (m.formacao || "").toString().trim() || match?.formacao || null,
              nota_final: normPct(m.nota_final) ?? match?.nota_final ?? null,
              frequencia: normPct(m.frequencia) ?? match?.frequencia ?? null,
              status:
                (m.status || match?.status || "").toString().trim() || null,
              certificado:
                (m.certificado || match?.certificado || "").toString().trim() ||
                null,
              medalha:
                (m.medalha || match?.medalha || "").toString().trim() || null,
            };

            await upsert(row);
            match ? updated++ : added++;
          }

          toast(
            `${added} novo(s), ${updated} atualizado(s)${skipped ? `, ${skipped} ignorado(s)` : ""}.`,
            "success",
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Exportação ────────────────────────────────────────────────
  function buildExportRows(rows) {
    return rows.map((r, i) => ({
      "#": i + 1,
      Nome: r.nome || "",
      CPF: r.cpf || "",
      "E-mail": r.email || "",
      Cidade: r.cidade || "",
      Modalidade: r.modalidade || "",
      "Curso/Formação": r.formacao || "",
      "Nota Final": r.nota_final ?? "",
      Frequência: r.frequencia ?? "",
      Status: r.status || "",
      Certificado: r.certificado || "",
      Medalha: r.medalha || "",
    }));
  }

  function exportXlsx(rows, filename) {
    const data = buildExportRows(rows);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 4 },
      { wch: 32 },
      { wch: 16 },
      { wch: 30 },
      { wch: 16 },
      { wch: 12 },
      { wch: 28 },
      { wch: 12 },
      { wch: 12 },
      { wch: 24 },
      { wch: 26 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, filename || "GeracaoTech_Certificados.xlsx");
    toast("Planilha exportada!", "success");
  }

  function exportHtml(rows, filename) {
    const CERT_COLORS = {
      "Certificado de Conclusão": { bg: "#d1fae5", text: "#065f46" },
      "Certificado de Participação": { bg: "#dbeafe", text: "#1e3a8a" },
      "Certificado de Vinculação": { bg: "#ede9fe", text: "#4c1d95" },
    };
    const MEDAL_COLORS = {
      ouro: "#f59e0b",
      prata: "#94a3b8",
      bronze: "#b45309",
    };

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Certificados — Geração Tech</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;background:#fff;color:#111}
      h1{font-size:20px;margin-bottom:4px}
      p.sub{font-size:13px;color:#666;margin-bottom:20px}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th{background:#1e293b;color:#fff;padding:7px 9px;text-align:left;white-space:nowrap}
      td{padding:5px 9px;border-bottom:1px solid #eee}
      tr:hover td{background:#f9fafb}
    </style></head><body>
    <h1>📋 Geração Tech — Alunos para Certificação</h1>
    <p class="sub">Exportado em ${new Date().toLocaleDateString("pt-BR")} · ${rows.length} aluno(s)</p>
    <table><thead><tr>
      <th>#</th><th>Nome</th><th>CPF</th><th>E-mail</th><th>Cidade</th>
      <th>Modalidade</th><th>Curso/Formação</th><th>Nota Final</th>
      <th>Frequência</th><th>Status</th><th>Certificado</th><th>Medalha</th>
    </tr></thead><tbody>`;

    rows.forEach((r, i) => {
      const cc = CERT_COLORS[r.certificado] || {};
      const mc = MEDAL_COLORS[(r.medalha || "").toLowerCase()] || "";
      html += `<tr>
        <td>${i + 1}</td>
        <td style="font-weight:600">${r.nome || ""}</td>
        <td>${r.cpf || ""}</td>
        <td>${r.email || ""}</td>
        <td>${r.cidade || ""}</td>
        <td>${r.modalidade || ""}</td>
        <td>${r.formacao || ""}</td>
        <td style="text-align:center">${r.nota_final ?? ""}</td>
        <td style="text-align:center">${r.frequencia != null ? r.frequencia + "%" : ""}</td>
        <td>${r.status || ""}</td>
        <td style="background:${cc.bg || ""};color:${cc.text || ""};font-weight:600">${r.certificado || ""}</td>
        <td style="color:${mc};font-weight:700">${r.medalha || ""}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "GeracaoTech_Certificados.html";
    a.click();
    URL.revokeObjectURL(url);
    toast("HTML exportado!", "success");
  }

  // ── Render principal ──────────────────────────────────────────
  const CERT_OPTIONS = [
    "",
    "Certificado de Conclusão",
    "Certificado de Participação",
    "Certificado de Vinculação",
  ];
  const MEDAL_OPTIONS = ["", "ouro", "prata", "bronze"];
  const MEDAL_ICONS = { ouro: "🥇", prata: "🥈", bronze: "🥉" };

  let _allRows = [];
  let _filteredRows = [];
  let _filterForm = "";
  let _filterCert = "";
  let _filterMedal = "";
  let _search = "";

  async function render() {
    const container = document.getElementById("certContent");
    if (!container) return;
    container.innerHTML = `<div class="rpt-loading">⏳ Carregando...</div>`;
    try {
      _allRows = await getAll();
    } catch (err) {
      container.innerHTML = `<div class="rpt-loading" style="color:var(--red)">Erro: ${err.message}</div>`;
      return;
    }
    _renderView(container);
  }

  function _applyFilters() {
    _filteredRows = _allRows.filter((r) => {
      if (_filterForm && normalizar(r.formacao) !== normalizar(_filterForm))
        return false;
      if (_filterCert && normalizar(r.certificado) !== normalizar(_filterCert))
        return false;
      if (_filterMedal && normalizar(r.medalha) !== normalizar(_filterMedal))
        return false;
      if (_search) {
        const q = normalizar(_search);
        const hay = normalizar([r.nome, r.cpf, r.email, r.cidade].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function _renderView(container) {
    _applyFilters();
    const formacoes = [
      ...new Set(_allRows.map((r) => r.formacao).filter(Boolean)),
    ].sort();

    container.innerHTML = `
    <div style="padding:0 0 40px">
      <div class="rpt-header" style="margin-bottom:20px">
        <div class="rpt-header-top">
          <div class="rpt-logo-mark" style="background:linear-gradient(135deg,#059669,#10b981)">GT</div>
          <div class="rpt-header-text">
            <h1 class="rpt-main-title">Gerenciamento de Certificados</h1>
            <p class="rpt-main-sub" id="certSubtitle">${_allRows.length} alunos cadastrados · ${_filteredRows.length} exibidos</p>
          </div>
          <div class="rpt-header-btns">
            <button class="rpt-edit-btn" id="certBtnSistema" style="background:linear-gradient(135deg,#2563eb,#7b4fff)" title="Importa do sistema apenas alunos com Conclusão ou Participação">
              🔄 Importar do Sistema
            </button>
            <button class="rpt-edit-btn" id="certBtnImport" title="Importar planilha .xlsx de inscrições">
              📥 Importar .xlsx
            </button>
            <button class="rpt-edit-btn" id="certBtnExportXlsx" style="background:var(--green)">📊 .xlsx</button>
            <button class="rpt-edit-btn" id="certBtnExportHtml" style="background:#7c3aed">🎨 .html</button>
          </div>
        </div>
      </div>

      <div style="background:rgba(37,99,235,0.07);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:10px 16px;margin-bottom:16px;font-size:12.5px;color:var(--text2);line-height:1.5">
        💡 <strong>Importar do Sistema</strong> — traz automaticamente os alunos com <em>Certificado de Conclusão</em> e <em>Certificado de Participação</em> de todas as formações, com nota, frequência e medalha. Não altera nenhuma tabela original. Depois preencha CPF, e-mail e cidade clicando nas células.
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center">
        <div class="search-wrap" style="flex:1;min-width:200px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" id="certSearch" placeholder="Buscar por nome, CPF ou e-mail..." value="${_search}" />
        </div>
        <select id="certFilterForm" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todas as formações</option>
          ${formacoes.map((f) => `<option value="${f}" ${_filterForm === f ? "selected" : ""}>${f}</option>`).join("")}
        </select>
        <select id="certFilterCert" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todos os certificados</option>
          ${CERT_OPTIONS.filter(Boolean)
            .map(
              (c) =>
                `<option value="${c}" ${_filterCert === c ? "selected" : ""}>${c}</option>`,
            )
            .join("")}
        </select>
        <select id="certFilterMedal" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todas as medalhas</option>
          <option value="ouro"   ${_filterMedal === "ouro" ? "selected" : ""}>🥇 Ouro</option>
          <option value="prata"  ${_filterMedal === "prata" ? "selected" : ""}>🥈 Prata</option>
          <option value="bronze" ${_filterMedal === "bronze" ? "selected" : ""}>🥉 Bronze</option>
        </select>
        <input type="file" id="certFileInput" accept=".xlsx" style="display:none" />
      </div>

      <div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border2)">
        <table class="students-table" style="min-width:1000px">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th style="min-width:190px">Nome</th>
              <th style="min-width:130px">CPF</th>
              <th style="min-width:190px">E-mail</th>
              <th style="min-width:110px">Cidade</th>
              <th style="min-width:100px">Modalidade</th>
              <th style="min-width:170px">Curso/Formação</th>
              <th style="width:90px">Nota Final</th>
              <th style="width:90px">Frequência</th>
              <th style="min-width:160px">Status</th>
              <th style="min-width:220px">Certificado</th>
              <th style="min-width:130px">Medalha</th>
              <th style="width:36px"></th>
            </tr>
          </thead>
          <tbody id="certTableBody">
            ${
              _filteredRows.length === 0
                ? `<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text3)">
                  ${
                    _allRows.length === 0
                      ? 'Nenhum aluno cadastrado. Clique em <strong>"Importar do Sistema"</strong> para começar.'
                      : "Nenhum aluno encontrado com os filtros aplicados."
                  }
                </td></tr>`
                : _filteredRows.map((r, i) => _buildRow(r, i)).join("")
            }
          </tbody>
        </table>
      </div>
    </div>`;

    // ── Events ──────────────────────────────────────────────────
    document.getElementById("certSearch")?.addEventListener("input", (e) => {
      _search = e.target.value;
      _applyFilters();
      _rerenderBody();
    });
    document
      .getElementById("certFilterForm")
      ?.addEventListener("change", (e) => {
        _filterForm = e.target.value;
        _applyFilters();
        _rerenderBody();
      });
    document
      .getElementById("certFilterCert")
      ?.addEventListener("change", (e) => {
        _filterCert = e.target.value;
        _applyFilters();
        _rerenderBody();
      });
    document
      .getElementById("certFilterMedal")
      ?.addEventListener("change", (e) => {
        _filterMedal = e.target.value;
        _applyFilters();
        _rerenderBody();
      });

    document
      .getElementById("certBtnSistema")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById("certBtnSistema");
        btn.disabled = true;
        btn.textContent = "⏳ Importando...";
        try {
          await importarDoSistema();
        } catch (err) {
          toast("Erro ao importar: " + err.message, "error");
        }
        btn.disabled = false;
        btn.textContent = "🔄 Importar do Sistema";
      });

    document.getElementById("certBtnImport")?.addEventListener("click", () => {
      document.getElementById("certFileInput").click();
    });
    document
      .getElementById("certFileInput")
      ?.addEventListener("change", async function () {
        const file = this.files[0];
        if (!file) return;
        this.value = "";
        try {
          await importarPlanilha(file);
          await render();
        } catch (err) {
          toast("Erro ao importar: " + err.message, "error");
        }
      });

    document
      .getElementById("certBtnExportXlsx")
      ?.addEventListener("click", () => exportXlsx(_filteredRows));
    document
      .getElementById("certBtnExportHtml")
      ?.addEventListener("click", () => exportHtml(_filteredRows));
  }

  // ── Build row ─────────────────────────────────────────────────
  function _buildRow(r, i) {
    const CERT_CSS = {
      "Certificado de Conclusão": "aprovado",
      "Certificado de Participação": "participacao",
      "Certificado de Vinculação": "vinculacao",
    };
    const certClass = CERT_CSS[r.certificado] || "vazio";

    const certOpts = CERT_OPTIONS.map(
      (o) =>
        `<option value="${o}" ${r.certificado === o ? "selected" : ""}>${o || "— selecione —"}</option>`,
    ).join("");
    const medalOpts = MEDAL_OPTIONS.map(
      (o) =>
        `<option value="${o}" ${(r.medalha || "").toLowerCase() === o ? "selected" : ""}>${o ? MEDAL_ICONS[o] + " " + o : "— nenhuma —"}</option>`,
    ).join("");

    // Campos de texto editáveis inline
    const editCell = (field, value, type = "text", extra = "") =>
      `<input type="${type}" value="${(value || "").toString().replace(/"/g, "&quot;")}"
        style="width:100%;background:transparent;border:none;outline:none;font-family:var(--font);font-size:13px;color:var(--text1);padding:2px 0"
        onchange="Cert._onTextChange('${r.id}','${field}',this.value)"
        ${extra} />`;

    const nome_safe = (r.nome || "").replace(/'/g, "\\'");

    return `<tr data-cert-id="${r.id}">
      <td style="text-align:center;color:var(--text3)">${i + 1}</td>
      <td style="font-weight:600;min-width:190px">${editCell("nome", r.nome)}</td>
      <td style="font-family:monospace;font-size:12px">${editCell("cpf", r.cpf)}</td>
      <td style="font-size:12px">${editCell("email", r.email, "email")}</td>
      <td>${editCell("cidade", r.cidade)}</td>
      <td>${editCell("modalidade", r.modalidade)}</td>
      <td style="font-size:12px">${editCell("formacao", r.formacao)}</td>
      <td style="text-align:center">${editCell("nota_final", r.nota_final, "number", 'min="0" max="10" step="0.1"')}</td>
      <td style="text-align:center">${editCell("frequencia", r.frequencia, "number", 'min="0" max="100" step="1"')}</td>
      <td style="font-size:12px">${editCell("status", r.status)}</td>
      <td>
        <select class="status-badge ${certClass}" onchange="Cert._onFieldChange('${r.id}','certificado',this.value,this)">
          ${certOpts}
        </select>
      </td>
      <td>
        <select class="medal-badge${r.medalha ? " medal-" + r.medalha.toLowerCase() : ""}" onchange="Cert._onFieldChange('${r.id}','medalha',this.value,this)">
          ${medalOpts}
        </select>
      </td>
      <td>
        <button class="btn-del" title="Remover" onclick="Cert._deleteRow('${r.id}','${nome_safe}')">✕</button>
      </td>
    </tr>`;
  }

  function _rerenderBody() {
    const tbody = document.getElementById("certTableBody");
    if (!tbody) return;
    const sub = document.getElementById("certSubtitle");
    if (sub)
      sub.textContent = `${_allRows.length} alunos cadastrados · ${_filteredRows.length} exibidos`;
    tbody.innerHTML =
      _filteredRows.length === 0
        ? `<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text3)">Nenhum aluno encontrado.</td></tr>`
        : _filteredRows.map((r, i) => _buildRow(r, i)).join("");
  }

  // ── Handlers expostos ─────────────────────────────────────────
  window.Cert = {
    _onTextChange: async (id, field, value) => {
      try {
        const col = {
          nome: "nome",
          cpf: "cpf",
          email: "email",
          cidade: "cidade",
          modalidade: "modalidade",
          formacao: "formacao",
          nota_final: "nota_final",
          frequencia: "frequencia",
          status: "status",
        }[field];
        if (!col) return;
        const v =
          field === "nota_final" || field === "frequencia"
            ? value === ""
              ? null
              : parseFloat(value)
            : value.trim() || null;
        await patchField(id, col, v);
        const row = _allRows.find((r) => r.id === id);
        if (row) row[field] = v;
      } catch (err) {
        toast("Erro ao salvar: " + err.message, "error");
      }
    },

    _onFieldChange: async (id, field, value, el) => {
      try {
        await patchField(id, field, value);
        const row = _allRows.find((r) => r.id === id);
        if (row) row[field] = value;
        const CERT_CSS = {
          "Certificado de Conclusão": "aprovado",
          "Certificado de Participação": "participacao",
          "Certificado de Vinculação": "vinculacao",
        };
        if (field === "certificado") {
          el.className = "status-badge " + (CERT_CSS[value] || "vazio");
        }
        if (field === "medalha") {
          el.className =
            "medal-badge" + (value ? " medal-" + value.toLowerCase() : "");
        }
      } catch (err) {
        toast("Erro ao salvar: " + err.message, "error");
      }
    },

    _deleteRow: async (id, nome) => {
      if (!confirm(`Remover "${nome}"?`)) return;
      try {
        await deleteRow(id);
        _allRows = _allRows.filter((r) => r.id !== id);
        _applyFilters();
        _rerenderBody();
        toast("Aluno removido.", "info");
      } catch (err) {
        toast("Erro ao remover: " + err.message, "error");
      }
    },
  };

  window.Certificados = { render };
})();

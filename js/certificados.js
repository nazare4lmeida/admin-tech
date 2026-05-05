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

        // nota_final: usa calcNotaMedia; para presenciais pega notaProjetoFinal diretamente
        // se calcNotaMedia retornar null (presencial sem nota 10), ainda usa notaProjetoFinal
        let nota = GT.calcNotaMedia(s);
        if (nota == null && s.notaProjetoFinal) {
          nota = parseFloat(s.notaProjetoFinal) || null;
        }

        // nota_prova: preenche automaticamente com nota_prova_rec do sistema
        const notaProva =
          s.notaProvaRec != null ? parseFloat(s.notaProvaRec) || null : null;

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
            nota_prova: notaProva ?? existing_row.nota_prova ?? null,
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
            nota_prova: notaProva ?? null,
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
    nota_prova: ["nota_prova", "nota_da_prova"],
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
              nota_prova: normPct(m.nota_prova) ?? match?.nota_prova ?? null,
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
      "Nota Projeto": r.nota_final ?? "",
      "Nota Prova": r.nota_prova ?? "",
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
      <th>Modalidade</th><th>Curso/Formação</th><th>Nota Projeto</th><th>Nota Prova</th>
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
        <td style="text-align:center">${r.nota_prova ?? ""}</td>
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
  let _filterIncompleto = "";
  let _search = "";
  let _fillMode = false;

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
      if (_filterIncompleto) {
        const camposObrigatorios = [
          "nome",
          "cpf",
          "email",
          "cidade",
          "certificado",
        ];
        const incompleto = camposObrigatorios.some(
          (c) => !r[c] || r[c].toString().trim() === "",
        );
        if (_filterIncompleto === "incompleto" && !incompleto) return false;
        if (_filterIncompleto === "completo" && incompleto) return false;
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
            <button class="rpt-edit-btn" id="certBtnSistema" style="background:linear-gradient(135deg,#2563eb,#7b4fff);color:#fff;font-weight:600" title="Importa do sistema apenas alunos com Conclusão ou Participação">
              🔄 Importar do Sistema
            </button>
            <button class="rpt-edit-btn" id="certBtnImport" style="color:#fff;font-weight:600" title="Importar planilha .xlsx de inscrições">
              📥 Importar .xlsx
            </button>
            <button class="rpt-edit-btn" id="certBtnExportXlsx" style="background:#059669;color:#fff;font-weight:600">📊 Exportar .xlsx</button>
            <button class="rpt-edit-btn" id="certBtnExportHtml" style="background:#7c3aed;color:#fff;font-weight:600">🎨 Exportar .html</button>
            <button class="rpt-edit-btn" id="certBtnNovoAluno" style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;font-weight:600">➕ Novo Aluno</button>
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
        <select id="certFilterIncompleto" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todos os alunos</option>
          <option value="incompleto" ${_filterIncompleto === "incompleto" ? "selected" : ""}>⚠️ Campos incompletos</option>
          <option value="completo"   ${_filterIncompleto === "completo" ? "selected" : ""}>✅ Todos completos</option>
        </select>
        <input type="file" id="certFileInput" accept=".xlsx" style="display:none" />
        <label class="fill-toggle-wrap" for="certFillToggle" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 12px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm)">
          <span class="toggle-switch">
            <input type="checkbox" id="certFillToggle" />
            <span class="toggle-track"></span>
          </span>
          <span style="font-size:13px;color:var(--text2);white-space:nowrap">✨ Preenchimento Inteligente</span>
        </label>
      </div>

      <!-- Scroll bar on top -->
      <div id="certScrollTop" style="overflow-x:auto;height:16px;margin-bottom:2px;border-radius:6px">
        <div id="certScrollSpacer" style="height:1px"></div>
      </div>
      <div id="certScrollMain" style="overflow-x:auto;border-radius:12px;border:1px solid var(--border2)">
        <table class="students-table" id="certTable" style="min-width:1200px">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th style="min-width:190px">Nome</th>
              <th style="min-width:130px">CPF</th>
              <th style="min-width:190px">E-mail</th>
              <th style="min-width:110px">Cidade</th>
              <th style="min-width:100px">Modalidade</th>
              <th style="min-width:170px">Curso/Formação</th>
              <th style="width:90px">Nota Projeto</th>
              <th style="width:90px">Nota Prova</th>
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
                ? `<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text3)">
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
      <!-- Scroll bar on bottom -->
      <div id="certScrollBottom" style="overflow-x:auto;height:16px;margin-top:2px;border-radius:6px">
        <div id="certScrollBottomSpacer" style="height:1px"></div>
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
      .getElementById("certFilterIncompleto")
      ?.addEventListener("change", (e) => {
        _filterIncompleto = e.target.value;
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
    document
      .getElementById("certBtnNovoAluno")
      ?.addEventListener("click", openNovoAlunoModal);
    const certFillToggle = document.getElementById("certFillToggle");
    if (certFillToggle) {
      certFillToggle.checked = _fillMode;
      certFillToggle.addEventListener("change", () => {
        _fillMode = certFillToggle.checked;
        _rerenderBody();
      });
    }

    // Sync top + bottom scrollbars with main table scrollbar
    const scrollMain = document.getElementById("certScrollMain");
    const scrollTop = document.getElementById("certScrollTop");
    const scrollBottom = document.getElementById("certScrollBottom");
    const table = document.getElementById("certTable");
    if (scrollMain && table) {
      setTimeout(() => {
        const w = table.offsetWidth + "px";
        const spacerTop = document.getElementById("certScrollSpacer");
        const spacerBot = document.getElementById("certScrollBottomSpacer");
        if (spacerTop) spacerTop.style.width = w;
        if (spacerBot) spacerBot.style.width = w;
      }, 100);
      const syncAll = (src) => {
        const left = src.scrollLeft;
        if (scrollMain && scrollMain !== src) scrollMain.scrollLeft = left;
        if (scrollTop && scrollTop !== src) scrollTop.scrollLeft = left;
        if (scrollBottom && scrollBottom !== src)
          scrollBottom.scrollLeft = left;
      };
      if (scrollTop)
        scrollTop.addEventListener("scroll", () => syncAll(scrollTop));
      scrollMain.addEventListener("scroll", () => syncAll(scrollMain));
      if (scrollBottom)
        scrollBottom.addEventListener("scroll", () => syncAll(scrollBottom));
    }
  }

  // Célula de nota: permite número ou "Não entregou"
  function notaCell(field, value, id) {
    const NAO_ENTREGOU = "Não entregou";
    const isNE = value === NAO_ENTREGOU;
    const numVal = !isNE && value != null ? value : "";
    const inputStyle =
      "width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;outline:none;font-family:var(--font);font-size:12.5px;color:var(--text1);padding:4px 8px;transition:border-color .15s,box-shadow .15s;box-sizing:border-box;-moz-appearance:textfield;appearance:textfield";
    if (isNE) {
      return (
        '<div style="display:flex;gap:4px;align-items:center">' +
        '<span style="font-size:11px;color:var(--text3);white-space:nowrap;flex:1">Não entregou</span>' +
        "<button onclick=\"Cert._clearNota(event,'" +
        id +
        "','" +
        field +
        '\')" title="Limpar"' +
        ' style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:11px;padding:2px">✕</button>' +
        "</div>"
      );
    }
    return (
      '<div style="display:flex;gap:3px;align-items:center">' +
      '<input type="number" value="' +
      (numVal !== "" ? numVal : "") +
      '" min="0" max="10" step="0.1"' +
      ' style="' +
      inputStyle +
      '"' +
      " onfocus=\"this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 2px rgba(74,125,245,0.15)'\"" +
      " onblur=\"this.style.borderColor='var(--border)';this.style.boxShadow='none'\"" +
      " onchange=\"Cert._onTextChange('" +
      id +
      "','" +
      field +
      "',this.value)\" />" +
      "<button onclick=\"Cert._setNaoEntregou(event,'" +
      id +
      "','" +
      field +
      '\')" title="Não entregou"' +
      ' style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text3);font-size:10px;padding:2px 4px;white-space:nowrap;flex-shrink:0">NE</button>' +
      "</div>"
    );
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
        style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;outline:none;font-family:var(--font);font-size:12.5px;color:var(--text1);padding:4px 8px;transition:border-color .15s,box-shadow .15s;box-sizing:border-box"
        onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 2px rgba(74,125,245,0.15)'"
        onblur="this.style.borderColor='var(--border)';this.style.boxShadow='none'"
        onchange="Cert._onTextChange('${r.id}','${field}',this.value)"
        placeholder="${field === "cpf" ? "000.000.000-00" : field === "email" ? "email@exemplo.com" : ""}"
        ${extra} />`;

    const nome_safe = (r.nome || "").replace(/'/g, "\\'");

    const tdStyle = "padding:6px 8px;vertical-align:middle";
    return `<tr data-cert-id="${r.id}">
      <td style="${tdStyle};text-align:center;color:var(--text3);font-size:12px;width:36px">${i + 1}</td>
      <td style="${tdStyle};font-weight:600;min-width:190px;${_fillMode ? "cursor:pointer" : ""}"
          onclick="${_fillMode ? `Cert._openFillModal('${r.id}')` : ""}"
          title="${_fillMode ? "Clique para preencher" : ""}">
        ${
          _fillMode
            ? `<span style="font-weight:600;color:var(--text1)">${(r.nome || "(sem nome)").replace(/</g, "&lt;")}</span>`
            : editCell("nome", r.nome)
        }
      </td>
      <td style="${tdStyle};min-width:130px">${editCell("cpf", r.cpf)}</td>
      <td style="${tdStyle};min-width:180px">${editCell("email", r.email, "email")}</td>
      <td style="${tdStyle};min-width:110px">${editCell("cidade", r.cidade)}</td>
      <td style="${tdStyle};min-width:100px">${editCell("modalidade", r.modalidade)}</td>
      <td style="${tdStyle};min-width:160px">${editCell("formacao", r.formacao)}</td>
      <td style="${tdStyle};width:110px">${notaCell("nota_final", r.nota_final, r.id)}</td>
      <td style="${tdStyle};width:110px">${notaCell("nota_prova", r.nota_prova, r.id)}</td>
      <td style="${tdStyle};width:90px">${editCell("frequencia", r.frequencia, "number", 'min="0" max="100" step="1"')}</td>
      <td style="${tdStyle};min-width:160px">${editCell("status", r.status)}</td>
      <td style="${tdStyle};min-width:220px">
        <select class="status-badge ${certClass}" style="width:100%;cursor:pointer" onchange="Cert._onFieldChange('${r.id}','certificado',this.value,this)">
          ${certOpts}
        </select>
      </td>
      <td style="${tdStyle};min-width:130px">
        <select class="medal-badge${r.medalha ? " medal-" + r.medalha.toLowerCase() : ""}" style="width:100%;cursor:pointer" onchange="Cert._onFieldChange('${r.id}','medalha',this.value,this)">
          ${medalOpts}
        </select>
      </td>
      <td style="${tdStyle};width:36px;text-align:center">
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
        ? `<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text3)">Nenhum aluno encontrado.</td></tr>`
        : _filteredRows.map((r, i) => _buildRow(r, i)).join("");
  }

  function openNovoAlunoModal() {
    const existing = document.getElementById("certNovoOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "certNovoOverlay";
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <button class="modal-close" id="certNovoClose">✕</button>
        <div class="modal-header">
          <div class="modal-icon">➕</div>
          <div class="modal-title-wrap">
            <div class="modal-title">Novo Aluno</div>
            <div class="modal-subtitle">Preencha os dados para certificação</div>
          </div>
        </div>
        <div class="modal-fields" style="gap:12px">
          <div class="modal-field"><label>Nome Completo *</label><input type="text" id="cnNome" placeholder="Nome completo do aluno" /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>CPF</label><input type="text" id="cnCpf" placeholder="000.000.000-00" /></div>
            <div class="modal-field"><label>E-mail</label><input type="email" id="cnEmail" placeholder="email@exemplo.com" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--font);font-size:13px;color:var(--text1);outline:none" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Cidade</label><input type="text" id="cnCidade" placeholder="Fortaleza" /></div>
            <div class="modal-field"><label>Modalidade</label>
              <select id="cnModalidade">
                <option value="">— selecione —</option>
                <option value="Online">Online</option>
                <option value="Presencial">Presencial</option>
              </select>
            </div>
          </div>
          <div class="modal-field"><label>Curso/Formação</label><input type="text" id="cnFormacao" placeholder="Ex: Fullstack, IA Generativa..." /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Nota do Projeto</label><input type="number" id="cnNota" min="0" max="10" step="0.1" placeholder="0.0" /></div>
            <div class="modal-field"><label>Nota da Prova</label><input type="number" id="cnNotaProva" min="0" max="10" step="0.1" placeholder="0.0" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Frequência (%)</label><input type="number" id="cnFreq" min="0" max="100" step="1" placeholder="0" /></div>
            <div></div>
          </div>
          <div class="modal-field"><label>Status</label>
              <select id="cnStatus" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--font);font-size:13px;color:var(--text1);outline:none">
                <option value="">— selecione —</option>
                <option value="Concluído com Êxito">Concluído com Êxito</option>
                <option value="Certificado de Conclusão">Certificado de Conclusão</option>
                <option value="Certificado de Participação">Certificado de Participação</option>
                <option value="Certificado de Vinculação">Certificado de Vinculação</option>
              </select>
            </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Certificado</label>
              <select id="cnCert">
                <option value="">— selecione —</option>
                <option value="Certificado de Conclusão">Certificado de Conclusão</option>
                <option value="Certificado de Participação">Certificado de Participação</option>
                <option value="Certificado de Vinculação">Certificado de Vinculação</option>
              </select>
            </div>
            <div class="modal-field"><label>Medalha</label>
              <select id="cnMedalha">
                <option value="">— nenhuma —</option>
                <option value="ouro">🥇 Ouro</option>
                <option value="prata">🥈 Prata</option>
                <option value="bronze">🥉 Bronze</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" id="certNovoCancel">Cancelar</button>
          <button class="btn-modal-apply" id="certNovoSave">✓ Adicionar Aluno</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("certNovoClose").onclick = close;
    document.getElementById("certNovoCancel").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById("certNovoSave").onclick = async () => {
      const nome = document.getElementById("cnNome").value.trim();
      if (!nome) {
        toast("Nome é obrigatório.", "error");
        return;
      }
      const row = {
        id: "cert_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        nome,
        cpf: document.getElementById("cnCpf").value.trim() || null,
        email: document.getElementById("cnEmail").value.trim() || null,
        cidade: document.getElementById("cnCidade").value.trim() || null,
        modalidade: document.getElementById("cnModalidade").value || null,
        formacao: document.getElementById("cnFormacao").value.trim() || null,
        nota_final: parseFloat(document.getElementById("cnNota").value) || null,
        nota_prova:
          parseFloat(document.getElementById("cnNotaProva").value) || null,
        frequencia: parseFloat(document.getElementById("cnFreq").value) || null,
        status: document.getElementById("cnStatus").value.trim() || null,
        certificado: document.getElementById("cnCert").value || null,
        medalha: document.getElementById("cnMedalha").value || null,
      };
      try {
        await upsert(row);
        _allRows.push(row);
        _applyFilters();
        _rerenderBody();
        close();
        toast(`Aluno "${nome}" adicionado!`, "success");
      } catch (err) {
        toast("Erro ao salvar: " + err.message, "error");
      }
    };
  }

  function openCertFillModal(id) {
    const idx = _filteredRows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    _renderCertFillModal(idx);
  }

  function _renderCertFillModal(idx) {
    const existing = document.getElementById("certFillOverlay");
    if (existing) existing.remove();

    const r = _filteredRows[idx];
    const total = _filteredRows.length;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "certFillOverlay";

    const CERT_CSS = {
      "Certificado de Conclusão": "aprovado",
      "Certificado de Participação": "participacao",
      "Certificado de Vinculação": "vinculacao",
    };

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <button class="modal-close" id="cfClose">✕</button>
        <div class="modal-header">
          <div class="modal-icon">✨</div>
          <div class="modal-title-wrap">
            <div class="modal-title">Preenchimento Inteligente</div>
            <div class="modal-subtitle">Aluno ${idx + 1} de ${total}</div>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:11px;font-weight:600;color:var(--text3);letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:6px">Nome Completo</label>
          <input type="text" id="cfNome" value="${r.nome || ""}"
            style="width:100%;background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:10px 14px;font-weight:600;color:var(--accent);font-size:14px;font-family:var(--font);outline:none;box-sizing:border-box"
            onfocus="this.style.borderColor='var(--accent)'"
            onblur="this.style.borderColor='var(--accent)'" />
        </div>
        <div class="modal-fields" style="gap:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>CPF</label><input type="text" id="cfCpf" value="${r.cpf || ""}" placeholder="000.000.000-00" /></div>
            <div class="modal-field"><label>E-mail</label><input type="email" id="cfEmail" value="${r.email || ""}" placeholder="email@exemplo.com" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--font);font-size:13px;color:var(--text1);outline:none" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Cidade</label><input type="text" id="cfCidade" value="${r.cidade || ""}" placeholder="Fortaleza" /></div>
            <div class="modal-field"><label>Modalidade</label>
              <select id="cfModalidade">
                <option value="">— selecione —</option>
                <option value="Online" ${r.modalidade === "Online" ? "selected" : ""}>Online</option>
                <option value="Presencial" ${r.modalidade === "Presencial" ? "selected" : ""}>Presencial</option>
              </select>
            </div>
          </div>
          <div class="modal-field"><label>Curso/Formação</label><input type="text" id="cfFormacao" value="${r.formacao || ""}" /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Nota do Projeto</label><input type="number" id="cfNota" value="${r.nota_final ?? ""}" min="0" max="10" step="0.1" /></div>
            <div class="modal-field"><label>Nota da Prova</label><input type="number" id="cfNotaProva" value="${r.nota_prova ?? ""}" min="0" max="10" step="0.1" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Frequência (%)</label><input type="number" id="cfFreq" value="${r.frequencia ?? ""}" min="0" max="100" step="1" /></div>
            <div></div>
          </div>
          <div class="modal-field"><label>Status</label>
              <select id="cfStatus" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--font);font-size:13px;color:var(--text1);outline:none">
                <option value="">— selecione —</option>
                <option value="Concluído com Êxito"        ${r.status === "Concluído com Êxito" ? "selected" : ""}>Concluído com Êxito</option>
                <option value="Aprovado(a) - Participação" ${r.status === "Aprovado(a) - Participação" ? "selected" : ""}>Aprovado(a) - Participação</option>
                <option value="Aprovado(a) - Conclusão"    ${r.status === "Aprovado(a) - Conclusão" ? "selected" : ""}>Aprovado(a) - Conclusão</option>
                <option value="Sem Nota - Vínculo"         ${r.status === "Sem Nota - Vínculo" ? "selected" : ""}>Sem Nota - Vínculo</option>
              </select>
            </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="modal-field"><label>Certificado</label>
              <select id="cfCert">
                <option value="">— selecione —</option>
                <option value="Certificado de Conclusão"    ${r.certificado === "Certificado de Conclusão" ? "selected" : ""}>Certificado de Conclusão</option>
                <option value="Certificado de Participação" ${r.certificado === "Certificado de Participação" ? "selected" : ""}>Certificado de Participação</option>
                <option value="Certificado de Vinculação"   ${r.certificado === "Certificado de Vinculação" ? "selected" : ""}>Certificado de Vinculação</option>
              </select>
            </div>
            <div class="modal-field"><label>Medalha</label>
              <select id="cfMedalha">
                <option value="">— nenhuma —</option>
                <option value="ouro"   ${(r.medalha || "").toLowerCase() === "ouro" ? "selected" : ""}>🥇 Ouro</option>
                <option value="prata"  ${(r.medalha || "").toLowerCase() === "prata" ? "selected" : ""}>🥈 Prata</option>
                <option value="bronze" ${(r.medalha || "").toLowerCase() === "bronze" ? "selected" : ""}>🥉 Bronze</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" id="cfCancel">Cancelar</button>
          <button class="btn-modal-apply" id="cfApply">✓ Aplicar</button>
        </div>
        <div class="modal-nav" id="cfNav">
          <button class="btn-modal-nav" id="cfPrev" ${idx === 0 ? "disabled" : ""}>← Anterior</button>
          <span class="modal-nav-info">${idx + 1} / ${total}</span>
          <button class="btn-modal-nav" id="cfNext" ${idx === total - 1 ? "disabled" : ""}>Próximo →</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("cfClose").onclick = close;
    document.getElementById("cfCancel").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById("cfPrev").onclick = () => {
      close();
      _renderCertFillModal(idx - 1);
    };
    document.getElementById("cfNext").onclick = () => {
      close();
      _renderCertFillModal(idx + 1);
    };

    // Keyboard navigation
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && idx > 0) {
        close();
        _renderCertFillModal(idx - 1);
      }
      if (e.key === "ArrowRight" && idx < total - 1) {
        close();
        _renderCertFillModal(idx + 1);
      }
      if (e.key === "Enter") document.getElementById("cfApply").click();
      if (e.key === "Escape") close();
    });
    // Focus first field
    setTimeout(() => document.getElementById("cfCpf")?.focus(), 50);

    document.getElementById("cfApply").onclick = async () => {
      const updates = {
        nome: document.getElementById("cfNome").value.trim() || r.nome,
        cpf: document.getElementById("cfCpf").value.trim() || null,
        email: document.getElementById("cfEmail").value.trim() || null,
        cidade: document.getElementById("cfCidade").value.trim() || null,
        modalidade: document.getElementById("cfModalidade").value || null,
        formacao: document.getElementById("cfFormacao").value.trim() || null,
        nota_final: parseFloat(document.getElementById("cfNota").value) || null,
        nota_prova:
          parseFloat(document.getElementById("cfNotaProva").value) || null,
        frequencia: parseFloat(document.getElementById("cfFreq").value) || null,
        status: document.getElementById("cfStatus").value.trim() || null,
        certificado: document.getElementById("cfCert").value || null,
        medalha: document.getElementById("cfMedalha").value || null,
      };
      try {
        await patchRow(r.id, updates);
        Object.assign(r, updates);
        // Update in _allRows too
        const allRow = _allRows.find((x) => x.id === r.id);
        if (allRow) Object.assign(allRow, updates);
        _rerenderBody();
        close();
        toast("Salvo!", "success");
        // Auto-advance to next if exists
        if (idx < total - 1) _renderCertFillModal(idx + 1);
      } catch (err) {
        toast("Erro ao salvar: " + err.message, "error");
      }
    };
  }

  // ── Handlers expostos ─────────────────────────────────────────
  window.Cert = {
    _openFillModal: (id) => openCertFillModal(id),
    _setNaoEntregou: async (e, id, field) => {
      e.preventDefault();
      try {
        await patchField(id, field, "Não entregou");
        const row = _allRows.find((r) => r.id === id);
        if (row) row[field] = "Não entregou";
        _rerenderBody();
      } catch (err) {
        toast("Erro: " + err.message, "error");
      }
    },
    _clearNota: async (e, id, field) => {
      e.preventDefault();
      try {
        await patchField(id, field, null);
        const row = _allRows.find((r) => r.id === id);
        if (row) row[field] = null;
        _rerenderBody();
      } catch (err) {
        toast("Erro: " + err.message, "error");
      }
    },
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
          nota_prova: "nota_prova",
          frequencia: "frequencia",
          status: "status",
        }[field];
        if (!col) return;
        const v =
          field === "nota_final" || field === "nota_prova"
            ? value === ""
              ? null
              : isNaN(parseFloat(value))
                ? value
                : parseFloat(value)
            : field === "frequencia"
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

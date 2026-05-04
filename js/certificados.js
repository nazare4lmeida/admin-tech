/**
 * certificados.js — Gerenciamento de Alunos para Envio de Certificados
 * Tabela independente: alunos_certificados
 * Importa planilha de inscrições, cruza notas/frequência por leitura,
 * permite preencher Certificado e Medalha, exporta xlsx e html.
 */

(function () {
  "use strict";

  const TABLE = "alunos_certificados";

  // ── Supabase helpers ──────────────────────────────────────────
  function getUrl()  { return window.ENV?.SUPABASE_URL   || ""; }
  function getKey()  { return window.ENV?.SUPABASE_ANON_KEY || ""; }
  function getAuth() { return (window.Auth?.getToken?.() || getKey()); }

  async function sbFetch(path, options = {}) {
    const res = await fetch(getUrl() + "/rest/v1" + path, {
      method: options.method || "GET",
      headers: {
        apikey:          getKey(),
        Authorization:   "Bearer " + getAuth(),
        "Content-Type":  "application/json",
        Prefer:          options.prefer || "return=representation",
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

  async function deleteRow(id) {
    return sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }

  // ── Cruzamento com tabelas existentes (só leitura) ────────────
  function normalizar(str) {
    return (str || "").toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  }

  async function buscarDadosAluno(nome) {
    if (!window.GT) return null;
    for (const f of GT.FORMATIONS) {
      try {
        const students = await GT.getStudents(f.id);
        const match = students.find(s =>
          normalizar(s.nome) === normalizar(nome)
        );
        if (match) {
          return {
            nota:      GT.calcNotaMedia(match),
            frequencia: parseFloat(match.presencaFinalPlat) || null,
            status:    GT.calcStatus(match).label,
            formacao:  f.label,
          };
        }
      } catch {}
    }
    return null;
  }

  // ── Importação da planilha de inscrições ──────────────────────
  function normalizeHeader(str) {
    return normalizar(str).replace(/\s+/g, "_");
  }

  const COL_MAP_CERT = {
    cpf:              ["cpf"],
    email:            ["email"],
    nome:             ["nome_completo", "nome"],
    cidade:           ["cidade"],
    modalidade:       ["modalidade"],
    formacao:         ["curso_interesse", "curso", "formacao", "curso_formacao"],
    nota_final:       ["nota_final", "nota"],
    frequencia:       ["frequencia", "frequencia_percent", "presenca_final_plat"],
    status:           ["status_geral", "status", "situacao"],
    certificado:      ["certificado", "tipo_certificado"],
    medalha:          ["medalha"],
  };

  function mapRow(rawRow) {
    const mapped = {};
    Object.keys(rawRow).forEach(col => {
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
          const wb   = XLSX.read(data, { type: "array" });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

          if (!rows.length) { toast("Planilha vazia.", "error"); return; }

          let added = 0, updated = 0, skipped = 0;
          const existing = await getAll();

          for (const raw of rows) {
            const m = mapRow(raw);
            const nome = (m.nome || "").toString().trim();
            if (!nome) { skipped++; continue; }

            // Cruzamento automático (só leitura)
            const dadosAuto = await buscarDadosAluno(nome);

            // Verifica se já existe pelo nome normalizado
            const match = existing.find(e => normalizar(e.nome) === normalizar(nome));

            // Normaliza porcentagem (Excel pode mandar 0.47 em vez de 47)
            const normPct = v => {
              const n = parseFloat(v);
              if (isNaN(n)) return null;
              return n > 0 && n <= 1 ? Math.round(n * 1000) / 10 : n;
            };

            const row = {
              id:         match?.id || ("cert_" + Date.now() + "_" + Math.random().toString(36).slice(2,6)),
              nome,
              cpf:        (m.cpf || "").toString().trim() || match?.cpf || null,
              email:      (m.email || "").toString().trim() || match?.email || null,
              cidade:     (m.cidade || "").toString().trim() || match?.cidade || null,
              modalidade: (m.modalidade || "").toString().trim() || match?.modalidade || null,
              formacao:   (m.formacao || "").toString().trim() || dadosAuto?.formacao || match?.formacao || null,
              nota_final: normPct(m.nota_final) ?? dadosAuto?.nota ?? match?.nota_final ?? null,
              frequencia: normPct(m.frequencia) ?? dadosAuto?.frequencia ?? match?.frequencia ?? null,
              status:     (m.status || dadosAuto?.status || match?.status || "").toString().trim() || null,
              certificado: (m.certificado || match?.certificado || "").toString().trim() || null,
              medalha:    (m.medalha || match?.medalha || "").toString().trim() || null,
            };

            await upsert(row);
            match ? updated++ : added++;
          }

          toast(`${added} novo(s), ${updated} atualizado(s)${skipped ? `, ${skipped} ignorado(s)` : ""}.`, "success");
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
      "#":           i + 1,
      "Nome":        r.nome || "",
      "CPF":         r.cpf  || "",
      "E-mail":      r.email || "",
      "Cidade":      r.cidade || "",
      "Modalidade":  r.modalidade || "",
      "Curso/Formação": r.formacao || "",
      "Nota Final":  r.nota_final ?? "",
      "Frequência":  r.frequencia ?? "",
      "Status":      r.status || "",
      "Certificado": r.certificado || "",
      "Medalha":     r.medalha || "",
    }));
  }

  function exportXlsx(rows, filename) {
    const data = buildExportRows(rows);
    const wb   = XLSX.utils.book_new();
    const ws   = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      {wch:4},{wch:32},{wch:16},{wch:30},{wch:16},
      {wch:12},{wch:28},{wch:12},{wch:12},{wch:24},{wch:26},{wch:12}
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, filename || "GeracaoTech_Certificados.xlsx");
    toast("Planilha exportada!", "success");
  }

  function exportHtml(rows, filename) {
    const CERT_COLORS = {
      "Certificado de Conclusão":   { bg: "#d1fae5", text: "#065f46" },
      "Certificado de Participação":{ bg: "#dbeafe", text: "#1e3a8a" },
      "Certificado de Vinculação":  { bg: "#ede9fe", text: "#4c1d95" },
    };
    const MEDAL_COLORS = { "ouro": "#f59e0b", "prata": "#94a3b8", "bronze": "#b45309" };

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
      const mc = MEDAL_COLORS[(r.medalha||"").toLowerCase()] || "";
      html += `<tr>
        <td>${i+1}</td>
        <td style="font-weight:600">${r.nome||""}</td>
        <td>${r.cpf||""}</td>
        <td>${r.email||""}</td>
        <td>${r.cidade||""}</td>
        <td>${r.modalidade||""}</td>
        <td>${r.formacao||""}</td>
        <td style="text-align:center">${r.nota_final??""}</td>
        <td style="text-align:center">${r.frequencia??""}</td>
        <td>${r.status||""}</td>
        <td style="background:${cc.bg||""};color:${cc.text||""};font-weight:600">${r.certificado||""}</td>
        <td style="color:${mc};font-weight:700">${r.medalha||""}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename || "GeracaoTech_Certificados.html"; a.click();
    URL.revokeObjectURL(url);
    toast("HTML exportado!", "success");
  }

  // ── Render principal ──────────────────────────────────────────
  const CERT_OPTIONS = [
    "", "Certificado de Conclusão", "Certificado de Participação", "Certificado de Vinculação"
  ];
  const MEDAL_OPTIONS = ["", "ouro", "prata", "bronze"];

  let _allRows      = [];
  let _filteredRows = [];
  let _filterForm   = "";
  let _filterCert   = "";
  let _filterMedal  = "";
  let _search       = "";

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
    const norm = s => normalizar(s);
    _filteredRows = _allRows.filter(r => {
      if (_filterForm  && norm(r.formacao)    !== norm(_filterForm))   return false;
      if (_filterCert  && norm(r.certificado) !== norm(_filterCert))   return false;
      if (_filterMedal && norm(r.medalha)     !== norm(_filterMedal))  return false;
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

    // Opções únicas para filtros
    const formacoes = [...new Set(_allRows.map(r => r.formacao).filter(Boolean))].sort();

    container.innerHTML = `
    <div style="padding:0 0 40px">

      <!-- Header -->
      <div class="rpt-header" style="margin-bottom:20px">
        <div class="rpt-header-top">
          <div class="rpt-logo-mark" style="background:linear-gradient(135deg,#059669,#10b981)">GT</div>
          <div class="rpt-header-text">
            <h1 class="rpt-main-title">Gerenciamento de Certificados</h1>
            <p class="rpt-main-sub">${_allRows.length} alunos cadastrados · ${_filteredRows.length} exibidos</p>
          </div>
          <div class="rpt-header-btns">
            <button class="rpt-edit-btn" id="certBtnImport">📥 Importar</button>
            <button class="rpt-edit-btn" id="certBtnExportXlsx" style="background:var(--green)">📊 .xlsx</button>
            <button class="rpt-edit-btn" id="certBtnExportHtml" style="background:#7c3aed">🎨 .html</button>
          </div>
        </div>
      </div>

      <!-- Filtros -->
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center">
        <div class="search-wrap" style="flex:1;min-width:200px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" id="certSearch" placeholder="Buscar por nome, CPF ou e-mail..." value="${_search}" />
        </div>
        <select id="certFilterForm" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todas as formações</option>
          ${formacoes.map(f => `<option value="${f}" ${_filterForm===f?"selected":""}>${f}</option>`).join("")}
        </select>
        <select id="certFilterCert" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todos os certificados</option>
          ${CERT_OPTIONS.filter(Boolean).map(c => `<option value="${c}" ${_filterCert===c?"selected":""}>${c}</option>`).join("")}
        </select>
        <select id="certFilterMedal" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text1);font-family:var(--font);font-size:13px">
          <option value="">Todas as medalhas</option>
          <option value="ouro"   ${_filterMedal==="ouro"  ?"selected":""}>🥇 Ouro</option>
          <option value="prata"  ${_filterMedal==="prata" ?"selected":""}>🥈 Prata</option>
          <option value="bronze" ${_filterMedal==="bronze"?"selected":""}>🥉 Bronze</option>
        </select>
        <input type="file" id="certFileInput" accept=".xlsx" style="display:none" />
      </div>

      <!-- Tabela -->
      <div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border2)">
        <table class="students-table" style="min-width:900px">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th style="min-width:180px">Nome</th>
              <th style="min-width:120px">CPF</th>
              <th style="min-width:180px">E-mail</th>
              <th>Cidade</th>
              <th>Modalidade</th>
              <th style="min-width:160px">Curso/Formação</th>
              <th style="width:90px">Nota Final</th>
              <th style="width:90px">Frequência</th>
              <th style="min-width:160px">Status</th>
              <th style="min-width:220px">Certificado</th>
              <th style="min-width:130px">Medalha</th>
              <th style="width:36px"></th>
            </tr>
          </thead>
          <tbody id="certTableBody">
            ${_filteredRows.length === 0
              ? `<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text3)">
                  ${_allRows.length === 0 ? "Nenhum aluno cadastrado. Importe uma planilha para começar." : "Nenhum aluno encontrado com os filtros aplicados."}
                </td></tr>`
              : _filteredRows.map((r, i) => _buildRow(r, i)).join("")
            }
          </tbody>
        </table>
      </div>
    </div>`;

    // Events
    document.getElementById("certSearch")?.addEventListener("input", e => {
      _search = e.target.value; _applyFilters(); _rerenderBody();
    });
    document.getElementById("certFilterForm")?.addEventListener("change",  e => { _filterForm  = e.target.value; _applyFilters(); _rerenderBody(); });
    document.getElementById("certFilterCert")?.addEventListener("change",  e => { _filterCert  = e.target.value; _applyFilters(); _rerenderBody(); });
    document.getElementById("certFilterMedal")?.addEventListener("change", e => { _filterMedal = e.target.value; _applyFilters(); _rerenderBody(); });

    document.getElementById("certBtnImport")?.addEventListener("click", () => {
      document.getElementById("certFileInput").click();
    });
    document.getElementById("certFileInput")?.addEventListener("change", async function () {
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

    document.getElementById("certBtnExportXlsx")?.addEventListener("click", () => exportXlsx(_filteredRows));
    document.getElementById("certBtnExportHtml")?.addEventListener("click", () => exportHtml(_filteredRows));
  }

  function _buildRow(r, i) {
    const CERT_COLORS = {
      "Certificado de Conclusão":   "aprovado",
      "Certificado de Participação":"participacao",
      "Certificado de Vinculação":  "vinculacao",
    };
    const MEDAL_ICONS = { ouro: "🥇", prata: "🥈", bronze: "🥉" };
    const certClass   = CERT_COLORS[r.certificado] || "vazio";
    const medalIcon   = MEDAL_ICONS[(r.medalha||"").toLowerCase()] || "";

    const certOpts = CERT_OPTIONS.map(o =>
      `<option value="${o}" ${r.certificado===o?"selected":""}>${o||"— selecione —"}</option>`
    ).join("");
    const medalOpts = MEDAL_OPTIONS.map(o =>
      `<option value="${o}" ${(r.medalha||"").toLowerCase()===o?"selected":""}>${o ? MEDAL_ICONS[o]+" "+o : "— nenhuma —"}</option>`
    ).join("");

    return `<tr data-cert-id="${r.id}">
      <td style="text-align:center;color:var(--text3)">${i+1}</td>
      <td style="font-weight:600">${r.nome||""}</td>
      <td style="font-family:monospace;font-size:12px">${r.cpf||"—"}</td>
      <td style="font-size:12px">${r.email||"—"}</td>
      <td>${r.cidade||"—"}</td>
      <td>${r.modalidade||"—"}</td>
      <td style="font-size:12px">${r.formacao||"—"}</td>
      <td style="text-align:center;font-weight:600">${r.nota_final??""}</td>
      <td style="text-align:center">${r.frequencia!=null?r.frequencia+"%":""}</td>
      <td style="font-size:12px">${r.status||""}</td>
      <td>
        <select class="status-badge ${certClass}" data-field="certificado" onchange="Cert._onFieldChange('${r.id}','certificado',this.value,this)">
          ${certOpts}
        </select>
      </td>
      <td>
        <select class="medal-badge${r.medalha?" medal-"+(r.medalha).toLowerCase():""}" data-field="medalha" onchange="Cert._onFieldChange('${r.id}','medalha',this.value,this)">
          ${medalOpts}
        </select>
      </td>
      <td>
        <button class="btn-del" title="Remover" onclick="Cert._deleteRow('${r.id}','${(r.nome||"").replace(/'/g,"\\'")}')">✕</button>
      </td>
    </tr>`;
  }

  function _rerenderBody() {
    const tbody = document.getElementById("certTableBody");
    if (!tbody) return;
    // Update subtitle
    const sub = document.querySelector("#certContent .rpt-main-sub");
    if (sub) sub.textContent = `${_allRows.length} alunos cadastrados · ${_filteredRows.length} exibidos`;

    tbody.innerHTML = _filteredRows.length === 0
      ? `<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text3)">Nenhum aluno encontrado.</td></tr>`
      : _filteredRows.map((r, i) => _buildRow(r, i)).join("");
  }

  // Exposed for inline onchange handlers
  window.Cert = {
    _onFieldChange: async (id, field, value, el) => {
      try {
        const col = field === "certificado" ? "certificado" : "medalha";
        await patchField(id, col, value);
        // Update local cache
        const row = _allRows.find(r => r.id === id);
        if (row) row[field] = value;
        // Update CSS class on select
        if (field === "certificado") {
          const CERT_COLORS = {
            "Certificado de Conclusão":   "aprovado",
            "Certificado de Participação":"participacao",
            "Certificado de Vinculação":  "vinculacao",
          };
          el.className = "status-badge " + (CERT_COLORS[value] || "vazio");
        }
        if (field === "medalha") {
          el.className = "medal-badge" + (value ? " medal-" + value.toLowerCase() : "");
        }
      } catch (err) {
        toast("Erro ao salvar: " + err.message, "error");
      }
    },
    _deleteRow: async (id, nome) => {
      if (!confirm(`Remover "${nome}"?`)) return;
      try {
        await deleteRow(id);
        _allRows = _allRows.filter(r => r.id !== id);
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
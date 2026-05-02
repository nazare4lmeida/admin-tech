/**
 * table.js v4 — Renders the student table + SmartFill integration
 * Melhorias:
 *  - Modo compacto: clica na linha para expandir/recolher os campos
 *  - Linha compacta: nome completo + chips de resumo + certificado colorido
 *  - Passa navList ao SmartFill para navegação prev/next
 */

(function () {
  "use strict";

  let _currentFormation = null;
  let _searchTerm = "";
  let _filterStatus = "";
  let _selectedIds = new Set();
  let _fillModeEnabled = false;
  let _compactMode = false; // controlado pelo botão da topbar
  let _lastStudentsList = []; // cache para navList
  let _rankMap = null; // Map<id, {medalha, posicao, media}>

  // ============================================================
  // COMPACT MODE TOGGLE  (exposto para app.js ligar o botão)
  // ============================================================
  function setCompactMode(enabled) {
    _compactMode = enabled;
    if (_currentFormation) render(_currentFormation);
  }

  // ============================================================
  // CHIP HELPERS
  // ============================================================
  // Mapa dos chips de resumo: chave no objeto student → abreviação exibida
  function _buildChips(student, formation) {
    const chips = [];

    // Campos universais relevantes
    const checks = [
      {
        key: "provaRecuperacao",
        label: "PR",
        okVals: ["Fez – Aprovado", "Fez – Reprovado"],
      },
      {
        key: "desafioPresenca",
        label: "DP",
        okVals: ["Fez – Aprovado", "Fez – Reprovado"],
      },
      {
        key: "projetoFinal",
        label: "PF",
        okVals: ["Entregou – Aprovado", "Entregou – Reprovado"],
      },
    ];

    // Extra Fullstack
    if (formation && formation.id === "fullstack") {
      checks.push({
        key: "projetoFront",
        label: "PFront",
        okVals: ["Entregou – Aprovado", "Entregou – Reprovado"],
      });
      checks.push({
        key: "projetoBack",
        label: "PBack",
        okVals: ["Entregou – Aprovado", "Entregou – Reprovado"],
      });
    }

    checks.forEach((c) => {
      const val = student[c.key] || "";
      if (!val) return; // sem dado: não exibe o chip
      const ok = c.okVals.some((v) => val.includes(v));
      chips.push({ label: c.label, ok });
    });

    return chips;
  }

  // ============================================================
  // HEADERS  (só na visão expandida)
  // ============================================================
  function buildHeaders(formation) {
    // Presencial formations: minimal headers
    if (formation.presencial) {
      const head = document.getElementById("tableHead");
      head.innerHTML = `<tr>
        <th style="width:32px"></th>
        <th style="width:36px">#</th>
        <th style="min-width:170px">Nome do Aluno</th>
        <th>Sede</th>
        <th>Frequência (%)</th>
        <th>Nota Final</th>
        <th>Progresso (%)</th>
        <th style="width:90px">Medalha</th>
        <th style="min-width:180px">Status Final</th>
        <th style="width:36px"></th>
      </tr>`;
      return;
    }
    const head = document.getElementById("tableHead");
    const tr = document.createElement("tr");

    const thChk = document.createElement("th");
    thChk.style.cssText = "width:32px;text-align:center;";
    const chkAll = document.createElement("input");
    chkAll.type = "checkbox";
    chkAll.id = "chkSelectAll";
    chkAll.title = "Selecionar todos";
    chkAll.addEventListener("change", () => toggleSelectAll(chkAll.checked));
    thChk.appendChild(chkAll);
    tr.appendChild(thChk);

    const cols = [
      { label: "#", style: "width:36px" },
      { label: "Nome do Aluno", style: "min-width:170px" },
      { label: "Formação", style: "min-width:140px" },
    ];
    GT.UNIVERSAL_FIELDS.forEach((f) => cols.push({ label: f.label }));
    (formation.extra || []).forEach((ek) => {
      (GT.EXTRA_FIELDS[ek] || []).forEach((f) => cols.push({ label: f.label }));
    });
    cols.push({ label: "Nota Final", style: "width:90px;text-align:center" });
    cols.push({ label: "Medalha", style: "width:90px;text-align:center" });
    cols.push({ label: "Status Final", style: "min-width:200px" });
    cols.push({ label: "", style: "width:36px" });

    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c.label;
      if (c.style) th.style.cssText = c.style;
      tr.appendChild(th);
    });

    head.innerHTML = "";
    head.appendChild(tr);
  }

  // ============================================================
  // FORM HELPERS
  // ============================================================
  function makeSelect(options, value, onChange) {
    const sel = document.createElement("select");
    options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt || "—";
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }

  function makeNumber(value, min, max, step, onChange) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = min;
    inp.max = max;
    inp.step = step || 1;
    inp.value = value !== undefined && value !== "" ? value : "";
    inp.addEventListener("change", () => {
      let v = parseFloat(inp.value);
      if (isNaN(v)) v = "";
      else v = Math.min(max, Math.max(min, v));
      inp.value = v;
      onChange(v);
    });
    return inp;
  }

  function makeText(value, cls, onChange) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = value || "";
    if (cls) inp.className = cls;
    let timer;
    inp.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChange(inp.value), 600);
    });
    return inp;
  }

  function makeStatusBadge(status) {
    const span = document.createElement("span");
    span.className = "status-badge " + status.key;
    span.textContent = status.label;
    return span;
  }

  // ============================================================
  // SELECT ALL
  // ============================================================
  function toggleSelectAll(checked) {
    document.querySelectorAll(".row-checkbox").forEach((chk) => {
      chk.checked = checked;
      const id = chk.dataset.id;
      if (checked) _selectedIds.add(id);
      else _selectedIds.delete(id);
    });
    updateBulkDeleteBar();
  }

  function updateBulkDeleteBar() {
    const bar = document.getElementById("bulkDeleteBar");
    const count = _selectedIds.size;
    if (!bar) return;
    if (count > 0) {
      bar.classList.remove("hidden");
      const label = bar.querySelector(".bulk-count");
      if (label) label.textContent = count + " aluno(s) selecionado(s)";
      const fillBtn = document.getElementById("btnBulkFill");
      if (fillBtn)
        fillBtn.style.display = _fillModeEnabled ? "inline-flex" : "none";
    } else {
      bar.classList.add("hidden");
    }
  }

  // ============================================================
  // BUILD ROW — MODO COMPACTO
  // ============================================================
  function buildCompactRow(student, index, formation, allStudents) {
    const tr = document.createElement("tr");
    tr.dataset.id = student.id;
    tr.className = "compact-row";

    // ── Checkbox ──────────────────────────────────────────────
    const tdChk = document.createElement("td");
    tdChk.style.cssText = "text-align:center;width:32px;";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "row-checkbox";
    chk.dataset.id = student.id;
    chk.checked = _selectedIds.has(student.id);
    chk.addEventListener("change", (e) => {
      e.stopPropagation();
      if (chk.checked) _selectedIds.add(student.id);
      else {
        _selectedIds.delete(student.id);
        const ca = document.getElementById("chkSelectAll");
        if (ca) ca.checked = false;
      }
      updateBulkDeleteBar();
    });
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    // ── Número ────────────────────────────────────────────────
    const tdIdx = document.createElement("td");
    tdIdx.textContent = index + 1;
    tdIdx.style.cssText = "color:var(--text3);text-align:center;width:36px;";
    tr.appendChild(tdIdx);

    // ── Nome completo + chips ─────────────────────────────────
    const tdMain = document.createElement("td");
    tdMain.colSpan = 99;
    tdMain.style.cssText = "cursor:pointer;";

    const wrapper = document.createElement("div");
    wrapper.className = "compact-row-wrapper";

    // Nome
    const nameSpan = document.createElement("span");
    nameSpan.className = "compact-name";
    nameSpan.textContent = student.nome || "(sem nome)";
    wrapper.appendChild(nameSpan);

    // Chips de resumo
    const chipsWrap = document.createElement("span");
    chipsWrap.className = "compact-chips";

    const chips = _buildChips(student, formation);
    chips.forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "compact-chip " + (c.ok ? "chip-ok" : "chip-no");
      chip.textContent = (c.ok ? "✓" : "✕") + " " + c.label;
      chipsWrap.appendChild(chip);
    });

    // Nota final + medalha nos chips compactos
    const mediaCmp = GT.calcNotaMedia(student);
    if (mediaCmp !== null) {
      const notaChip = document.createElement("span");
      notaChip.className = "compact-chip chip-nota";
      notaChip.textContent = "✎ " + mediaCmp.toFixed(1);
      chipsWrap.appendChild(notaChip);
    }
    const rankInfoCmp = _rankMap ? _rankMap.get(student.id) : null;
    if (rankInfoCmp) {
      const mIcons = { ouro: "🥇", prata: "🥈", bronze: "🥉" };
      const medalCmp = document.createElement("span");
      medalCmp.className =
        "medal-badge medal-" + rankInfoCmp.medalha + " compact-status";
      medalCmp.textContent =
        (mIcons[rankInfoCmp.medalha] || "") +
        " " +
        rankInfoCmp.medalha.charAt(0).toUpperCase() +
        rankInfoCmp.medalha.slice(1);
      medalCmp.title = `#${rankInfoCmp.posicao} — média ${rankInfoCmp.media.toFixed(2)}`;
      chipsWrap.appendChild(medalCmp);
    }

    // Certificado (status final) — ao final da linha
    const status = GT.calcStatus(student);
    const statusChip = document.createElement("span");
    statusChip.className = "status-badge " + status.key + " compact-status";
    statusChip.textContent = status.label;
    chipsWrap.appendChild(statusChip);

    wrapper.appendChild(chipsWrap);
    tdMain.appendChild(wrapper);

    // ── Clique abre o modal de preenchimento ──────────────────
    tdMain.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (_fillModeEnabled || true) {
        // em modo compacto, sempre abre o modal
        SmartFill.openModal(student, [student.id], formation.id, allStudents);
      }
    });

    tr.appendChild(tdMain);
    return tr;
  }

  // ============================================================
  // BUILD ROW — MODO EXPANDIDO (original)
  // ============================================================
  function buildRow(student, index, formation, allStudents) {
    const tr = document.createElement("tr");
    tr.dataset.id = student.id;

    tr.addEventListener("click", (e) => {
      if (!_fillModeEnabled) return;
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT" ||
        e.target.tagName === "BUTTON"
      )
        return;
      if (_selectedIds.size > 1 && _selectedIds.has(student.id)) {
        SmartFill.openModal(null, [..._selectedIds], formation.id, allStudents);
      } else {
        SmartFill.openModal(student, [student.id], formation.id, allStudents);
      }
    });
    if (_fillModeEnabled) {
      tr.style.cursor = "pointer";
      tr.title = "Clique para preencher este aluno";
    }

    const tdChk = document.createElement("td");
    tdChk.style.textAlign = "center";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "row-checkbox";
    chk.dataset.id = student.id;
    chk.checked = _selectedIds.has(student.id);
    chk.addEventListener("change", () => {
      if (chk.checked) _selectedIds.add(student.id);
      else {
        _selectedIds.delete(student.id);
        const ca = document.getElementById("chkSelectAll");
        if (ca) ca.checked = false;
      }
      updateBulkDeleteBar();
    });
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    function update(field, value) {
      GT.updateField(formation.id, student.id, field, value).catch((err) => {
        console.error("updateField error:", err);
        toast("Erro ao salvar: " + err.message, "error");
      });
      student[field] = value;
      const statusCell = tr.querySelector(".status-cell");
      if (statusCell) {
        statusCell.innerHTML = "";
        statusCell.appendChild(makeStatusBadge(GT.calcStatus(student)));
      }
      updateSummary(formation.id);
      updateBadge(formation.id);
    }

    const tdIdx = document.createElement("td");
    tdIdx.textContent = index + 1;
    tdIdx.style.color = "var(--text3)";
    tdIdx.style.textAlign = "center";
    tr.appendChild(tdIdx);

    const tdNome = document.createElement("td");
    tdNome.appendChild(
      makeText(student.nome, "name-input", (v) => update("nome", v)),
    );
    tr.appendChild(tdNome);

    // ── PRESENCIAL: renderiza apenas os campos simplificados ──────────────
    if (formation.presencial) {
      // Formação (read-only label)
      const tdFormP = document.createElement("td");
      tdFormP.textContent = formation.label;
      tdFormP.style.color = "var(--text2)";
      tr.appendChild(tdFormP);

      // Sede (select)
      const tdSede = document.createElement("td");
      tdSede.appendChild(
        makeSelect(["", "Aldeota", "Bezerra", "Sul"], student.sede || "", (v) =>
          update("sede", v),
        ),
      );
      tr.appendChild(tdSede);

      // Frequência (%)
      const tdFreq = document.createElement("td");
      tdFreq.appendChild(
        makeNumber(student.presencaFinalPlat, 0, 100, 1, (v) =>
          update("presencaFinalPlat", v),
        ),
      );
      tr.appendChild(tdFreq);

      // Nota Final
      const tdNota = document.createElement("td");
      tdNota.appendChild(
        makeNumber(student.notaProjetoFinal, 0, 10, 0.1, (v) =>
          update("notaProjetoFinal", v),
        ),
      );
      tr.appendChild(tdNota);

      // Progresso (%)
      const tdProg = document.createElement("td");
      tdProg.appendChild(
        makeNumber(student.progressoCurso, 0, 100, 0.1, (v) =>
          update("progressoCurso", v),
        ),
      );
      tr.appendChild(tdProg);

      // Medalha (editável)
      const tdMedP = document.createElement("td");
      tdMedP.style.textAlign = "center";
      const riP = _rankMap ? _rankMap.get(student.id) : null;
      const selMedP = makeSelect(
        ["", "ouro", "prata", "bronze"],
        student.medalhaManual || (riP ? riP.medalha : ""),
        (v) => update("medalhaManual", v),
      );
      const mlP = {
        "": "— automático —",
        ouro: "🥇 Ouro",
        prata: "🥈 Prata",
        bronze: "🥉 Bronze",
      };
      [...selMedP.options].forEach((o) => {
        o.textContent = mlP[o.value] || o.value;
      });
      const medValP = student.medalhaManual || (riP ? riP.medalha : "");
      selMedP.className = "medal-badge" + (medValP ? " medal-" + medValP : "");
      selMedP.addEventListener("change", () => {
        selMedP.className =
          "medal-badge" + (selMedP.value ? " medal-" + selMedP.value : "");
      });
      tdMedP.appendChild(selMedP);
      tr.appendChild(tdMedP);

      // Status Final (editável)
      const tdStP = document.createElement("td");
      tdStP.className = "status-cell";
      const stAutoKeyP = student.statusManual || GT.calcStatus(student).key;
      const selStP = makeSelect(
        ["", "aprovado", "participacao", "vinculacao", "reprovado-falta"],
        stAutoKeyP,
        (v) => update("statusManual", v),
      );
      const slP = {
        "": "— automático —",
        aprovado: "Certificado de Conclusão",
        participacao: "Certificado de Participação",
        vinculacao: "Certificado de Vinculação",
        "reprovado-falta": "Reprovado por Falta",
      };
      [...selStP.options].forEach((o) => {
        o.textContent = slP[o.value] || o.value;
      });
      selStP.className = "status-badge " + stAutoKeyP;
      selStP.addEventListener("change", () => {
        selStP.className =
          "status-badge " + (selStP.value || GT.calcStatus(student).key);
      });
      tdStP.appendChild(selStP);
      tr.appendChild(tdStP);

      // Excluir
      const tdDelP = document.createElement("td");
      const btnDelP = document.createElement("button");
      btnDelP.className = "btn-del";
      btnDelP.title = "Remover aluno";
      btnDelP.textContent = "✕";
      btnDelP.addEventListener("click", () => {
        if (confirm(`Remover "${student.nome || "este aluno"}"?`)) {
          GT.deleteStudent(formation.id, student.id)
            .then(() => Table.render(formation.id))
            .catch((err) => toast("Erro ao excluir: " + err.message, "error"));
        }
      });
      tdDelP.appendChild(btnDelP);
      tr.appendChild(tdDelP);
      return tr;
    }
    // ── FIM PRESENCIAL ────────────────────────────────────────────────────

    const tdForm = document.createElement("td");
    const formSel = makeSelect(
      ["", ...GT.FORMATIONS.map((f) => f.label)],
      GT.FORMATIONS.find((f) => f.id === formation.id)?.label || "",
      async (val) => {
        const target = GT.FORMATIONS.find((f) => f.label === val);
        if (target && target.id !== formation.id) {
          try {
            await GT.moveStudentToFormation(formation.id, target.id, student);
            Table.render(formation.id);
            Table.updateAllBadges();
            toast("Aluno movido para " + target.label, "info");
          } catch (err) {
            toast("Erro ao mover aluno: " + err.message, "error");
          }
        }
      },
    );
    tdForm.appendChild(formSel);
    tr.appendChild(tdForm);

    GT.UNIVERSAL_FIELDS.forEach((f) => {
      const td = document.createElement("td");
      if (f.type === "select")
        td.appendChild(
          makeSelect(f.options, student[f.key] || "", (v) => update(f.key, v)),
        );
      else
        td.appendChild(
          makeNumber(student[f.key], f.min, f.max, f.step, (v) =>
            update(f.key, v),
          ),
        );
      tr.appendChild(td);
    });

    (formation.extra || []).forEach((ek) => {
      (GT.EXTRA_FIELDS[ek] || []).forEach((f) => {
        const td = document.createElement("td");
        if (f.type === "select")
          td.appendChild(
            makeSelect(f.options, student[f.key] || "", (v) =>
              update(f.key, v),
            ),
          );
        else
          td.appendChild(
            makeNumber(student[f.key], f.min, f.max, f.step, (v) =>
              update(f.key, v),
            ),
          );
        tr.appendChild(td);
      });
    });

    // Nota Final (calculada, read-only)
    const tdNotaFinal = document.createElement("td");
    tdNotaFinal.style.cssText =
      "text-align:center;font-weight:600;color:var(--text1);";
    const mediaVal = GT.calcNotaMedia(student);
    tdNotaFinal.textContent = mediaVal !== null ? mediaVal.toFixed(1) : "—";
    tr.appendChild(tdNotaFinal);

    // Medalha (editável)
    const tdMedalha = document.createElement("td");
    tdMedalha.style.textAlign = "center";
    const rankInfo = _rankMap ? _rankMap.get(student.id) : null;
    const selMedalha = makeSelect(
      ["", "ouro", "prata", "bronze"],
      student.medalhaManual || (rankInfo ? rankInfo.medalha : ""),
      (v) => update("medalhaManual", v),
    );
    const mlO = {
      "": "— automático —",
      ouro: "🥇 Ouro",
      prata: "🥈 Prata",
      bronze: "🥉 Bronze",
    };
    [...selMedalha.options].forEach((o) => {
      o.textContent = mlO[o.value] || o.value;
    });
    const medValO = student.medalhaManual || (rankInfo ? rankInfo.medalha : "");
    selMedalha.className = "medal-badge" + (medValO ? " medal-" + medValO : "");
    selMedalha.addEventListener("change", () => {
      selMedalha.className =
        "medal-badge" + (selMedalha.value ? " medal-" + selMedalha.value : "");
    });
    tdMedalha.appendChild(selMedalha);
    tr.appendChild(tdMedalha);

    // Status Final (editável)
    const tdStatus = document.createElement("td");
    tdStatus.className = "status-cell";
    const stAutoKey = student.statusManual || GT.calcStatus(student).key;
    const selStatus = makeSelect(
      ["", "aprovado", "participacao", "vinculacao", "reprovado-falta"],
      stAutoKey,
      (v) => update("statusManual", v),
    );
    const slO = {
      "": "— automático —",
      aprovado: "Certificado de Conclusão",
      participacao: "Certificado de Participação",
      vinculacao: "Certificado de Vinculação",
      "reprovado-falta": "Reprovado por Falta",
    };
    [...selStatus.options].forEach((o) => {
      o.textContent = slO[o.value] || o.value;
    });
    selStatus.className = "status-badge " + stAutoKey;
    selStatus.addEventListener("change", () => {
      selStatus.className =
        "status-badge " + (selStatus.value || GT.calcStatus(student).key);
    });
    tdStatus.appendChild(selStatus);
    tr.appendChild(tdStatus);

    const tdDel = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.className = "btn-del";
    btnDel.title = "Remover aluno";
    btnDel.textContent = "✕";
    btnDel.addEventListener("click", () => {
      if (confirm(`Remover "${student.nome || "este aluno"}"?`)) {
        GT.deleteStudent(formation.id, student.id)
          .then(() => Table.render(formation.id))
          .catch((err) => toast("Erro ao excluir: " + err.message, "error"));
      }
    });
    tdDel.appendChild(btnDel);
    tr.appendChild(tdDel);

    return tr;
  }

  // ============================================================
  // MAIN RENDER
  // ============================================================
  async function render(formationId) {
    _currentFormation = formationId;
    _selectedIds.clear();
    updateBulkDeleteBar();

    const formation = GT.FORMATIONS.find((f) => f.id === formationId);
    if (!formation) return;

    const tbody = document.getElementById("tableBody");
    const empty = document.getElementById("emptyState");
    tbody.innerHTML = `<tr><td colspan="99" style="text-align:center;padding:24px;color:var(--text3)">Carregando...</td></tr>`;

    let students;
    try {
      students = await GT.getStudents(formationId);
    } catch (err) {
      tbody.innerHTML = "";
      toast("Erro ao carregar alunos: " + err.message, "error");
      students = [];
    }

    if (_searchTerm) {
      const normalizar = (str) =>
        (str || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9 ]/g, "");
      const q = normalizar(_searchTerm);
      students = students.filter((s) => normalizar(s.nome).includes(q));
    }
    if (_filterStatus) {
      students = students.filter((s) => GT.calcStatus(s).key === _filterStatus);
    }

    _lastStudentsList = students; // guarda para navList

    // headers: mostrar somente no modo expandido
    if (_compactMode) {
      document.getElementById("tableHead").innerHTML = `
        <tr>
          <th style="width:32px"></th>
          <th style="width:36px">#</th>
          <th>Aluno — resumo</th>
        </tr>`;
    } else {
      buildHeaders(formation);
    }

    // Compute ranking for all students (including non-filtered for correct top 50)
    try {
      const allForRank = await GT.getStudents(formationId);
      _rankMap = GT.calcRanking(allForRank);
    } catch {
      _rankMap = new Map();
    }
    // Expõe para o smartfill usar ao abrir o modal
    window._rankMapForModal = _rankMap;

    tbody.innerHTML = "";
    if (students.length === 0) {
      empty.classList.remove("hidden");
      document.getElementById("studentsTable").style.display = "none";
    } else {
      empty.classList.add("hidden");
      document.getElementById("studentsTable").style.display = "";
      students.forEach((stu, i) => {
        if (_compactMode) {
          tbody.appendChild(buildCompactRow(stu, i, formation, students));
        } else {
          tbody.appendChild(buildRow(stu, i, formation, students));
        }
      });
    }

    updateSummaryFromList(students, formationId);
    updateBadgeFromCount(formationId, students.length);
    document.getElementById("topbarTitle").textContent =
      formation.icon + " " + formation.label;

    // Atualiza botão de toggle compacto na topbar
    const btn = document.getElementById("btnCompactToggle");
    if (btn)
      btn.title = _compactMode
        ? "Alternar para visão completa"
        : "Alternar para visão compacta";
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  function updateSummaryFromList(students, formationId) {
    const counts = {
      aprovado: 0,
      participacao: 0,
      vinculacao: 0,
      "reprovado-falta": 0,
      vazio: 0,
    };
    students.forEach((s) => {
      const st = GT.calcStatus(s);
      counts[st.key] = (counts[st.key] || 0) + 1;
    });
    const cards = document.getElementById("summaryCards");
    cards.innerHTML = `
      <div class="summary-card blue"><div class="card-icon">👥</div><div><div class="card-value">${students.length}</div><div class="card-label">Total</div></div></div>
      <div class="summary-card green"><div class="card-icon">🎓</div><div><div class="card-value">${counts.aprovado}</div><div class="card-label">Conclusão</div></div></div>
      <div class="summary-card yellow"><div class="card-icon">📄</div><div><div class="card-value">${counts.participacao}</div><div class="card-label">Participação</div></div></div>
      <div class="summary-card blue"><div class="card-icon">🔗</div><div><div class="card-value">${counts.vinculacao}</div><div class="card-label">Vinculação</div></div></div>
      <div class="summary-card red"><div class="card-icon">❌</div><div><div class="card-value">${counts["reprovado-falta"] || 0}</div><div class="card-label">Rep./Falta</div></div></div>
    `;
  }

  async function updateSummary(formationId) {
    try {
      const students = await GT.getStudents(formationId);
      updateSummaryFromList(students, formationId);
    } catch {}
  }

  function updateBadgeFromCount(formationId, count) {
    const el = document.getElementById("badge-" + formationId);
    if (el) el.textContent = count;
  }

  async function updateBadge(formationId) {
    try {
      const students = await GT.getStudents(formationId);
      updateBadgeFromCount(formationId, students.length);
    } catch {}
  }

  async function updateAllBadges() {
    for (const f of GT.FORMATIONS) await updateBadge(f.id);
  }

  function setSearch(term) {
    _searchTerm = term;
    if (_currentFormation) render(_currentFormation);
  }
  function setFilter(status) {
    _filterStatus = status;
    if (_currentFormation) render(_currentFormation);
  }
  function getSelectedIds() {
    return [..._selectedIds];
  }
  function setFillMode(enabled) {
    _fillModeEnabled = enabled;
    if (_currentFormation) render(_currentFormation);
  }

  window.Table = {
    render,
    updateSummary,
    updateBadge,
    updateAllBadges,
    setSearch,
    setFilter,
    getSelectedIds,
    setFillMode,
    setCompactMode,
  };
})();

/**
 * io.js — Import (.xlsx) and Export (.xlsx) logic — v3
 */

(function () {
  "use strict";

  const COL_MAP = {
    "nome do aluno": "nome", "nome": "nome", "nome completo": "nome",
    "curso": "formacao_label", "formação": "formacao_label", "formacao": "formacao_label",
    "status": "statusImportado", "situação": "statusImportado", "situacao": "statusImportado",
    "certificado": "statusImportado", "status final": "statusImportado",
    "prova de recuperação": "provaRecuperacao", "prova de recuperacao": "provaRecuperacao",
    "nota da prova de recuperação": "notaProvaRec", "nota da prova de recuperacao": "notaProvaRec", "nota rec": "notaProvaRec",
    "desafio da presença": "desafioPresenca", "desafio da presenca": "desafioPresenca",
    "porcentagem do desafio": "pctDesafioPresenca", "% desafio": "pctDesafioPresenca",
    "presença final na plataforma": "presencaFinalPlat", "presença final (%)": "presencaFinalPlat",
    "presenca final na plataforma (%)": "presencaFinalPlat", "presenca final plataforma": "presencaFinalPlat",
    "reprovado por falta": "reprovadoFalta",
    "projeto final": "projetoFinal", "nota do projeto final": "notaProjetoFinal", "nota proj. final": "notaProjetoFinal",
    "projeto front-end": "projetoFront", "nota do projeto front-end": "notaFront", "nota front": "notaFront",
    "projeto back-end": "projetoBack", "nota do projeto back-end": "notaBack", "nota back": "notaBack",
  };

  function normalizeKey(str) {
    return (str || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ()%+]/g, " ").replace(/\s+/g, " ").trim();
  }

  function resolveFormation(label) {
    const l = (label || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const f of GT.FORMATIONS) {
      const fl = f.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (l.includes(fl) || fl.includes(l)) return f.id;
    }
    return null;
  }

  function doImport(file, currentFormationId) {
    const btn = document.getElementById("btnImport");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length === 0) { toast("Planilha vazia ou sem dados reconhecíveis.", "error"); return; }
        const firstRow = rows[0];
        const colMapping = {};
        Object.keys(firstRow).forEach((col) => {
          const norm = normalizeKey(col);
          if (COL_MAP[norm]) { colMapping[col] = COL_MAP[norm]; return; }
          for (const [k, v] of Object.entries(COL_MAP)) {
            if (norm.includes(k) || k.includes(norm)) { colMapping[col] = v; break; }
          }
        });
        const byFormation = {}; let skipped = 0;
        rows.forEach((row) => {
          const mapped = {};
          Object.keys(row).forEach((col) => { if (colMapping[col]) mapped[colMapping[col]] = row[col]; });
          const nome = (mapped.nome || "").toString().trim();
          if (!nome) { skipped++; return; }
          let fid = null;
          if (mapped.formacao_label) fid = resolveFormation(mapped.formacao_label.toString());
          if (!fid) fid = currentFormationId;
          if (!byFormation[fid]) byFormation[fid] = [];
          byFormation[fid].push(mapped);
        });
        let totalAdded = 0, totalUpdated = 0;
        for (const [fid, students] of Object.entries(byFormation)) {
          const result = await GT.importStudents(fid, students);
          totalAdded += result.added; totalUpdated += result.updated;
        }
        const msg = `${totalAdded} novo(s), ${totalUpdated} atualizado(s)` + (skipped ? `, ${skipped} linha(s) ignorada(s)` : "");
        toast(msg + ".", "success");
        if (typeof Table !== "undefined") Table.render(currentFormationId);
      } catch (err) {
        console.error(err);
        toast("Erro ao processar a planilha: " + err.message, "error");
      } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ""; }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ============================================================
  // EXPORT — abre modal de configuração
  // ============================================================
  function openExportModal(currentFormationId) {
    const modal = document.getElementById("exportModal");
    if (!modal) { doExportDirect({ formation: currentFormationId, statuses: [] }); return; }

    // Atualiza label da formação atual
    const f = GT.FORMATIONS.find(f => f.id === currentFormationId);
    const lbl = document.getElementById("exportCurrentLabel");
    if (lbl && f) lbl.textContent = f.icon + " " + f.label + " (atual)";

    // Reset status checkboxes
    document.querySelectorAll("input[name='exportStatus']").forEach(cb => { cb.checked = false; });
    const allCb = document.getElementById("exportStatusAll");
    if (allCb) allCb.checked = true;

    // Reset formation radio
    const radios = document.querySelectorAll("input[name='exportFormation']");
    if (radios[0]) radios[0].checked = true;

    // "Todos" toggle behavior
    document.querySelectorAll("input[name='exportStatus']").forEach(cb => {
      cb.onchange = function() {
        if (this.value === "") {
          // clicking "all" — uncheck others
          if (this.checked) {
            document.querySelectorAll("input[name='exportStatus']").forEach(o => { if (o.value !== "") o.checked = false; });
          }
        } else {
          // clicking specific status — uncheck "all"
          if (allCb) allCb.checked = false;
        }
      };
    });

    modal.classList.remove("hidden");

    document.getElementById("exportModalClose").onclick = () => modal.classList.add("hidden");
    document.getElementById("exportModalCancel").onclick = () => modal.classList.add("hidden");
    document.getElementById("exportModalConfirm").onclick = () => {
      const formationMode = document.querySelector("input[name='exportFormation']:checked")?.value || "current";
      const checkedStatuses = [...document.querySelectorAll("input[name='exportStatus']:checked")].map(cb => cb.value).filter(v => v !== "");
      modal.classList.add("hidden");
      doExportDirect({
        formation: formationMode === "current" ? currentFormationId : "all",
        statuses: checkedStatuses,
      });
    };
  }

  async function doExportDirect({ formation, statuses }) {
    toast("Preparando exportação...", "info");
    try {
      let allStudents;
      if (formation === "all") {
        allStudents = await GT.getAllStudentsWithStatus();
      } else {
        const students = await GT.getStudents(formation);
        const f = GT.FORMATIONS.find(f => f.id === formation);
        allStudents = students.map(s => ({ ...s, _status: GT.calcStatus(s), _formationLabel: f ? f.label : formation }));
      }

      // Filter by status if any selected
      if (statuses && statuses.length > 0) {
        allStudents = allStudents.filter(s => statuses.includes(s._status.key));
      }

      if (allStudents.length === 0) { toast("Nenhum aluno encontrado com os critérios selecionados.", "error"); return; }

      function buildRows(students, idx_offset = 0) {
        return students.map((s, i) => ({
          "#": idx_offset + i + 1,
          "Nome do Aluno": s.nome || "",
          "Formação": s._formationLabel || "",
          "Prova de Recuperação": s.provaRecuperacao || "",
          "Nota Rec.": s.notaProvaRec !== undefined ? s.notaProvaRec : "",
          "Desafio Presença": s.desafioPresenca || "",
          "% Desafio": s.pctDesafioPresenca !== undefined ? s.pctDesafioPresenca : "",
          "Presença Final (%)": s.presencaFinalPlat !== undefined ? s.presencaFinalPlat : "",
          "Reprovado por Falta": s.reprovadoFalta || "",
          "Projeto Front-end": s.projetoFront || "",
          "Nota Front": s.notaFront !== undefined ? s.notaFront : "",
          "Projeto Back-end": s.projetoBack || "",
          "Nota Back": s.notaBack !== undefined ? s.notaBack : "",
          "Projeto Final": s.projetoFinal || "",
          "Nota Proj. Final": s.notaProjetoFinal !== undefined ? s.notaProjetoFinal : "",
          "Status Final": s._status.label,
        }));
      }

      const colWidths = [{wch:4},{wch:30},{wch:18},{wch:22},{wch:9},{wch:20},{wch:9},{wch:14},{wch:18},{wch:20},{wch:10},{wch:20},{wch:10},{wch:18},{wch:12},{wch:26}];
      const wb = XLSX.utils.book_new();

      if (formation === "all") {
        // Aba geral
        const ws = XLSX.utils.json_to_sheet(buildRows(allStudents));
        ws["!cols"] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, "Todos os Alunos");
        // Aba por formação
        for (const f of GT.FORMATIONS) {
          const fRows = allStudents.filter(s => s._formationLabel === f.label);
          if (fRows.length === 0) continue;
          const fws = XLSX.utils.json_to_sheet(buildRows(fRows));
          fws["!cols"] = colWidths;
          XLSX.utils.book_append_sheet(wb, fws, f.label.slice(0, 31));
        }
      } else {
        const f = GT.FORMATIONS.find(f => f.id === formation);
        const ws = XLSX.utils.json_to_sheet(buildRows(allStudents));
        ws["!cols"] = colWidths;
        const sheetName = f ? f.label.slice(0, 31) : "Alunos";
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      const statusSuffix = statuses && statuses.length > 0 ? "_" + statuses.join("-") : "";
      const formSuffix = formation === "all" ? "_todas" : "_" + (GT.FORMATIONS.find(f => f.id === formation)?.label || formation).replace(/\s+/g, "").toLowerCase();
      XLSX.writeFile(wb, `GeracaoTech${formSuffix}${statusSuffix}.xlsx`);
      toast("Exportação concluída!", "success");
    } catch (err) {
      console.error(err);
      toast("Erro ao exportar: " + err.message, "error");
    }
  }

  window.IO = { doImport, openExportModal, doExportDirect };
})();

/**
 * io.js — Import (.xlsx) and Export (.xlsx) logic — v3
 */

(function () {
  "use strict";

  const COL_MAP = {
    "nome do aluno": "nome",
    nome: "nome",
    "nome completo": "nome",
    curso: "formacao_label",
    formação: "formacao_label",
    formacao: "formacao_label",
    status: "statusImportado",
    situação: "statusImportado",
    situacao: "statusImportado",
    certificado: "statusImportado",
    "status final": "statusImportado",
    "prova de recuperação": "provaRecuperacao",
    "prova de recuperacao": "provaRecuperacao",
    "nota da prova de recuperação": "notaProvaRec",
    "nota da prova de recuperacao": "notaProvaRec",
    "nota rec": "notaProvaRec",
    "desafio da presença": "desafioPresenca",
    "desafio da presenca": "desafioPresenca",
    "porcentagem do desafio": "pctDesafioPresenca",
    "% desafio": "pctDesafioPresenca",
    "presença final na plataforma": "presencaFinalPlat",
    "presença final (%)": "presencaFinalPlat",
    "presenca final na plataforma (%)": "presencaFinalPlat",
    "presenca final plataforma": "presencaFinalPlat",
    "reprovado por falta": "reprovadoFalta",
    "projeto final": "projetoFinal",
    "nota do projeto final": "notaProjetoFinal",
    "nota proj. final": "notaProjetoFinal",
    "projeto front-end": "projetoFront",
    "nota do projeto front-end": "notaFront",
    "nota front": "notaFront",
    "projeto back-end": "projetoBack",
    "nota do projeto back-end": "notaBack",
    "nota back": "notaBack",
    // Campos presenciais
    sede: "sede",
    frequencia: "presencaFinalPlat",
    "frequencia (%)": "presencaFinalPlat",
    "nota final": "notaProjetoFinal",
    "nota final (0 10)": "notaProjetoFinal",
    progresso: "progressoCurso",
    "progresso (%)": "progressoCurso",
    "formacao (auto)": "formacao_label",
  };

  // Campos que podem vir como decimal do Excel (ex: 0.47 em vez de 47%)
  // Esses campos esperam valores de 0-100, então multiplicamos por 100 se necessário
  const PCT_FIELDS = new Set(["presencaFinalPlat", "progressoCurso"]);

  function normalizeKey(str) {
    return (str || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ()%+]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveFormation(label) {
    const l = (label || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    for (const f of GT.FORMATIONS) {
      const fl = f.label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (l.includes(fl) || fl.includes(l)) return f.id;
    }
    return null;
  }

  // Converte valor de porcentagem: se vier como decimal (0-1), multiplica por 100
  function normalizePct(val) {
    if (val === "" || val === null || val === undefined) return val;
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    // Se vier entre 0 e 1 (formato decimal do Excel), converte para 0-100
    if (n > 0 && n <= 1) return Math.round(n * 1000) / 10;
    return n;
  }

  function doImport(file, currentFormationId) {
    const btn = document.getElementById("btnImport");
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.6";
    }
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length === 0) {
          toast("Planilha vazia ou sem dados reconhecíveis.", "error");
          return;
        }
        const firstRow = rows[0];
        const colMapping = {};
        Object.keys(firstRow).forEach((col) => {
          const norm = normalizeKey(col);
          if (COL_MAP[norm]) {
            colMapping[col] = COL_MAP[norm];
            return;
          }
          for (const [k, v] of Object.entries(COL_MAP)) {
            if (norm.includes(k) || k.includes(norm)) {
              colMapping[col] = v;
              break;
            }
          }
        });
        const byFormation = {};
        let skipped = 0;
        rows.forEach((row) => {
          const mapped = {};
          Object.keys(row).forEach((col) => {
            if (colMapping[col]) {
              const fieldKey = colMapping[col];
              let val = row[col];
              // Normaliza campos de porcentagem que o Excel salva como decimal
              if (PCT_FIELDS.has(fieldKey)) {
                val = normalizePct(val);
              }
              mapped[fieldKey] = val;
            }
          });
          const nome = (mapped.nome || "").toString().trim();
          if (!nome) {
            skipped++;
            return;
          }
          let fid = null;
          if (mapped.formacao_label)
            fid = resolveFormation(mapped.formacao_label.toString());
          if (!fid) fid = currentFormationId;
          if (!byFormation[fid]) byFormation[fid] = [];
          byFormation[fid].push(mapped);
        });
        let totalAdded = 0,
          totalUpdated = 0;
        for (const [fid, students] of Object.entries(byFormation)) {
          const result = await GT.importStudents(fid, students);
          totalAdded += result.added;
          totalUpdated += result.updated;
        }
        const msg =
          `${totalAdded} novo(s), ${totalUpdated} atualizado(s)` +
          (skipped ? `, ${skipped} linha(s) ignorada(s)` : "");
        toast(msg + ".", "success");
        if (typeof Table !== "undefined") Table.render(currentFormationId);
      } catch (err) {
        console.error(err);
        toast("Erro ao processar a planilha: " + err.message, "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ============================================================
  // EXPORT — abre modal de configuração
  // ============================================================
  function openExportModal(currentFormationId) {
    const modal = document.getElementById("exportModal");
    if (!modal) {
      doExportDirect({ formation: currentFormationId, statuses: [] });
      return;
    }

    // Atualiza label da formação atual
    const f = GT.FORMATIONS.find((f) => f.id === currentFormationId);
    const lbl = document.getElementById("exportCurrentLabel");
    if (lbl && f) lbl.textContent = f.icon + " " + f.label + " (atual)";

    // Reset status checkboxes
    document.querySelectorAll("input[name='exportStatus']").forEach((cb) => {
      cb.checked = false;
    });
    const allCb = document.getElementById("exportStatusAll");
    if (allCb) allCb.checked = true;

    // Reset formation radio
    const radios = document.querySelectorAll("input[name='exportFormation']");
    if (radios[0]) radios[0].checked = true;

    // "Todos" toggle behavior
    document.querySelectorAll("input[name='exportStatus']").forEach((cb) => {
      cb.onchange = function () {
        if (this.value === "") {
          if (this.checked) {
            document
              .querySelectorAll("input[name='exportStatus']")
              .forEach((o) => {
                if (o.value !== "") o.checked = false;
              });
          }
        } else {
          if (allCb) allCb.checked = false;
        }
      };
    });

    modal.classList.remove("hidden");

    document.getElementById("exportModalClose").onclick = () =>
      modal.classList.add("hidden");
    document.getElementById("exportModalCancel").onclick = () =>
      modal.classList.add("hidden");
    document.getElementById("exportModalConfirmHtml").onclick = () => {
      const formationMode =
        document.querySelector("input[name='exportFormation']:checked")
          ?.value || "current";
      const checkedStatuses = [
        ...document.querySelectorAll("input[name='exportStatus']:checked"),
      ]
        .map((cb) => cb.value)
        .filter((v) => v !== "");
      modal.classList.add("hidden");
      doExportHtml({
        formation:
          formationMode === "current" ? currentFormationId : formationMode,
        statuses: checkedStatuses,
      });
    };
    document.getElementById("exportModalConfirm").onclick = () => {
      const formationMode =
        document.querySelector("input[name='exportFormation']:checked")
          ?.value || "current";
      const checkedStatuses = [
        ...document.querySelectorAll("input[name='exportStatus']:checked"),
      ]
        .map((cb) => cb.value)
        .filter((v) => v !== "");
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
        const f = GT.FORMATIONS.find((f) => f.id === formation);
        allStudents = students.map((s) => ({
          ...s,
          _status: GT.calcStatus(s),
          _formationLabel: f ? f.label : formation,
        }));
      }

      if (statuses && statuses.length > 0) {
        allStudents = allStudents.filter((s) =>
          statuses.includes(s._status.key),
        );
      }

      if (allStudents.length === 0) {
        toast(
          "Nenhum aluno encontrado com os critérios selecionados.",
          "error",
        );
        return;
      }

      function buildRows(students, idx_offset = 0) {
        return students.map((s, i) => ({
          "#": idx_offset + i + 1,
          "Nome do Aluno": s.nome || "",
          Formação: s._formationLabel || "",
          "Prova de Recuperação": s.provaRecuperacao || "",
          "Nota Rec.": s.notaProvaRec !== undefined ? s.notaProvaRec : "",
          "Desafio Presença": s.desafioPresenca || "",
          "% Desafio":
            s.pctDesafioPresenca !== undefined ? s.pctDesafioPresenca : "",
          "Presença Final (%)":
            s.presencaFinalPlat !== undefined ? s.presencaFinalPlat : "",
          "Reprovado por Falta": s.reprovadoFalta || "",
          "Projeto Front-end": s.projetoFront || "",
          "Nota Front": s.notaFront !== undefined ? s.notaFront : "",
          "Projeto Back-end": s.projetoBack || "",
          "Nota Back": s.notaBack !== undefined ? s.notaBack : "",
          "Projeto Final": s.projetoFinal || "",
          "Nota Proj. Final":
            s.notaProjetoFinal !== undefined ? s.notaProjetoFinal : "",
          "Nota Final (média)":
            GT.calcNotaMedia(s) !== null ? GT.calcNotaMedia(s).toFixed(2) : "",
          Medalha: window._rankMapForModal?.get(s.id)?.medalha || "",
          "Status Final": s._status.label,
        }));
      }

      const colWidths = [
        { wch: 4 },
        { wch: 30 },
        { wch: 18 },
        { wch: 22 },
        { wch: 9 },
        { wch: 20 },
        { wch: 9 },
        { wch: 14 },
        { wch: 18 },
        { wch: 20 },
        { wch: 10 },
        { wch: 20 },
        { wch: 10 },
        { wch: 18 },
        { wch: 12 },
        { wch: 16 },
        { wch: 10 },
        { wch: 26 },
      ];
      const wb = XLSX.utils.book_new();

      if (formation === "all") {
        const ws = XLSX.utils.json_to_sheet(buildRows(allStudents));
        ws["!cols"] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, "Todos os Alunos");
        for (const f of GT.FORMATIONS) {
          const fRows = allStudents.filter(
            (s) => s._formationLabel === f.label,
          );
          if (fRows.length === 0) continue;
          const fws = XLSX.utils.json_to_sheet(buildRows(fRows));
          fws["!cols"] = colWidths;
          XLSX.utils.book_append_sheet(wb, fws, f.label.slice(0, 31));
        }
      } else {
        const f = GT.FORMATIONS.find((f) => f.id === formation);
        const ws = XLSX.utils.json_to_sheet(buildRows(allStudents));
        ws["!cols"] = colWidths;
        const sheetName = f ? f.label.slice(0, 31) : "Alunos";
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      const statusSuffix =
        statuses && statuses.length > 0 ? "_" + statuses.join("-") : "";
      const formSuffix =
        formation === "all"
          ? "_todas"
          : "_" +
            (GT.FORMATIONS.find((f) => f.id === formation)?.label || formation)
              .replace(/\s+/g, "")
              .toLowerCase();
      XLSX.writeFile(wb, `GeracaoTech${formSuffix}${statusSuffix}.xlsx`);
      toast("Exportação concluída!", "success");
    } catch (err) {
      console.error(err);
      toast("Erro ao exportar: " + err.message, "error");
    }
  }

  async function doExportHtml({ formation, statuses }) {
    toast("Preparando exportação colorida...", "info");
    try {
      let allStudents;
      if (formation === "all") {
        allStudents = await GT.getAllStudentsWithStatus();
      } else {
        const students = await GT.getStudents(formation);
        const f = GT.FORMATIONS.find((f) => f.id === formation);
        allStudents = students.map((s) => ({
          ...s,
          _status: GT.calcStatus(s),
          _formationLabel: f ? f.label : formation,
        }));
      }
      if (statuses && statuses.length > 0) {
        allStudents = allStudents.filter((s) =>
          statuses.includes(s._status.key),
        );
      }
      if (allStudents.length === 0) {
        toast("Nenhum aluno encontrado.", "error");
        return;
      }

      const STATUS_COLORS = {
        aprovado: { bg: "#d1fae5", text: "#065f46" },
        participacao: { bg: "#dbeafe", text: "#1e3a8a" },
        vinculacao: { bg: "#ede9fe", text: "#4c1d95" },
        "reprovado-falta": { bg: "#fee2e2", text: "#7f1d1d" },
        vazio: { bg: "#f3f4f6", text: "#374151" },
      };

      const headers = [
        "#",
        "Nome do Aluno",
        "Formação",
        "Prova de Recuperação",
        "Nota Rec.",
        "Desafio Presença",
        "% Desafio",
        "Presença Final (%)",
        "Reprovado por Falta",
        "Projeto Front-end",
        "Nota Front",
        "Projeto Back-end",
        "Nota Back",
        "Projeto Final",
        "Nota Proj. Final",
        "Nota Final (média)",
        "Medalha",
        "Status Final",
      ];

      function rowData(s, i) {
        return [
          i + 1,
          s.nome || "",
          s._formationLabel || "",
          s.provaRecuperacao || "",
          s.notaProvaRec ?? "",
          s.desafioPresenca || "",
          s.pctDesafioPresenca ?? "",
          s.presencaFinalPlat ?? "",
          s.reprovadoFalta || "",
          s.projetoFront || "",
          s.notaFront ?? "",
          s.projetoBack || "",
          s.notaBack ?? "",
          s.projetoFinal || "",
          s.notaProjetoFinal ?? "",
          GT.calcNotaMedia(s) !== null ? GT.calcNotaMedia(s).toFixed(2) : "",
          window._rankMapForModal?.get(s.id)?.medalha || "",
          s._status.label,
        ];
      }

      function buildTable(students) {
        let html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px">`;
        html +=
          `<tr style="background:#1e293b;color:#fff">` +
          headers
            .map(
              (h) =>
                `<th style="padding:6px 10px;white-space:nowrap">${h}</th>`,
            )
            .join("") +
          `</tr>`;
        students.forEach((s, i) => {
          const c = STATUS_COLORS[s._status.key] || STATUS_COLORS["vazio"];
          const cells = rowData(s, i)
            .map(
              (v) =>
                `<td style="background:${c.bg};color:${c.text};padding:4px 8px">${v}</td>`,
            )
            .join("");
          html += `<tr>${cells}</tr>`;
        });
        html += `</table>`;
        return html;
      }

      let body = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Geração Tech</title></head><body style="font-family:Arial,sans-serif;padding:16px">`;
      body += `<h2 style="margin-bottom:16px">Geração Tech — Exportação</h2>`;

      if (formation === "all") {
        body += `<h3>Todos os Alunos</h3>` + buildTable(allStudents);
        for (const f of GT.FORMATIONS) {
          const fRows = allStudents.filter(
            (s) => s._formationLabel === f.label,
          );
          if (fRows.length === 0) continue;
          body +=
            `<h3 style="margin-top:32px">${f.label}</h3>` + buildTable(fRows);
        }
      } else {
        const f = GT.FORMATIONS.find((f) => f.id === formation);
        body += `<h3>${f ? f.label : ""}</h3>` + buildTable(allStudents);
      }

      body += `</body></html>`;

      const blob = new Blob([body], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const formSuffix =
        formation === "all"
          ? "_todas"
          : "_" +
            (GT.FORMATIONS.find((f) => f.id === formation)?.label || formation)
              .replace(/\s+/g, "")
              .toLowerCase();
      a.href = url;
      a.download = `GeracaoTech${formSuffix}_colorido.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Exportação colorida concluída!", "success");
    } catch (err) {
      console.error(err);
      toast("Erro ao exportar: " + err.message, "error");
    }
  }

  // ============================================================
  // EXPORTAR TOP 50
  // ============================================================
  async function doExportTop50(format) {
    toast("Preparando exportação Top 50...", "info");
    try {
      const allStudents = await GT.getAllStudentsWithStatus();

      // Recalcula o ranking global com TODOS os alunos de TODAS as formações
      const rankMap = GT.calcRanking(allStudents);

      // Filtra só quem tem medalha (automática ou manual)
      const top50 = allStudents
        .filter((s) => {
          return s.medalhaManual || rankMap.get(s.id)?.medalha;
        })
        .map((s) => ({
          ...s,
          _medalha: s.medalhaManual || rankMap.get(s.id)?.medalha || "",
          _media: GT.calcNotaMedia(s),
        }))
        .sort((a, b) => {
          const ordem = { ouro: 1, prata: 2, bronze: 3 };
          if (ordem[a._medalha] !== ordem[b._medalha])
            return (ordem[a._medalha] || 9) - (ordem[b._medalha] || 9);
          return (b._media || 0) - (a._media || 0);
        });

      if (top50.length === 0) {
        toast("Nenhum aluno no Top 50.", "info");
        return;
      }

      if (format === "xlsx") {
        const rows = top50.map((s, i) => ({
          "#": i + 1,
          Medalha:
            { ouro: "🥇 Ouro", prata: "🥈 Prata", bronze: "🥉 Bronze" }[
              s._medalha
            ] || s._medalha,
          Nome: s.nome || "",
          Formação: s._formationLabel || "",
          "Nota Final": s._media != null ? Number(s._media.toFixed(2)) : "",
          "Presença (%)": s.presencaFinalPlat ?? "",
          "Progresso (%)": s.progressoCurso ?? "",
          "Status Final": s._status.label,
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [
          { wch: 4 },
          { wch: 12 },
          { wch: 32 },
          { wch: 20 },
          { wch: 12 },
          { wch: 14 },
          { wch: 14 },
          { wch: 26 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, "Top 50");
        XLSX.writeFile(wb, "GeracaoTech_Top50.xlsx");
        toast("Top 50 exportado!", "success");
      } else {
        const STATUS_COLORS = {
          aprovado: { bg: "#d1fae5", text: "#065f46" },
          participacao: { bg: "#dbeafe", text: "#1e3a8a" },
          vinculacao: { bg: "#ede9fe", text: "#4c1d95" },
          "reprovado-falta": { bg: "#fee2e2", text: "#7f1d1d" },
          vazio: { bg: "#f3f4f6", text: "#374151" },
        };
        const MEDAL_COLORS = {
          ouro: "#fbbf24",
          prata: "#cbd5e1",
          bronze: "#d4956a",
        };

        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
          <title>Top 50 — Geração Tech</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;background:#fff;color:#111}
            h1{font-size:20px;margin-bottom:4px}
            p{font-size:13px;color:#666;margin-bottom:20px}
            table{border-collapse:collapse;width:100%;font-size:12px}
            th{background:#1e293b;color:#fff;padding:8px 10px;text-align:left}
            td{padding:6px 10px;border-bottom:1px solid #eee}
          </style></head><body>
          <h1>🏆 Top 50 — Geração Tech</h1>
          <p>Exportado em ${new Date().toLocaleDateString("pt-BR")} · ${top50.length} alunos premiados</p>
          <table><thead><tr>
            <th>#</th><th>Medalha</th><th>Nome</th><th>Formação</th>
            <th>Nota Final</th><th>Presença (%)</th><th>Progresso (%)</th><th>Status Final</th>
          </tr></thead><tbody>`;

        top50.forEach((s, i) => {
          const c = STATUS_COLORS[s._status?.key] || STATUS_COLORS.vazio;
          const mc = MEDAL_COLORS[s._medalha] || "#888";
          const ml =
            { ouro: "🥇 Ouro", prata: "🥈 Prata", bronze: "🥉 Bronze" }[
              s._medalha
            ] || s._medalha;
          html += `<tr>
            <td style="background:${c.bg};color:${c.text}">${i + 1}</td>
            <td style="background:${c.bg};color:${mc};font-weight:700">${ml}</td>
            <td style="background:${c.bg};color:${c.text};font-weight:600">${s.nome || ""}</td>
            <td style="background:${c.bg};color:${c.text}">${s._formationLabel || ""}</td>
            <td style="background:${c.bg};color:${c.text};text-align:center">${s._media != null ? s._media.toFixed(2) : ""}</td>
            <td style="background:${c.bg};color:${c.text};text-align:center">${s.presencaFinalPlat ?? ""}</td>
            <td style="background:${c.bg};color:${c.text};text-align:center">${s.progressoCurso ?? ""}</td>
            <td style="background:${c.bg};color:${c.text}">${s._status?.label || ""}</td>
          </tr>`;
        });

        html += `</tbody></table></body></html>`;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "GeracaoTech_Top50.html";
        a.click();
        URL.revokeObjectURL(url);
        toast("Top 50 HTML exportado!", "success");
      }
    } catch (err) {
      console.error(err);
      toast("Erro ao exportar Top 50: " + err.message, "error");
    }
  }
  window.IO = {
    doImport,
    openExportModal,
    doExportDirect,
    doExportHtml,
    doExportTop50,
  };
})();

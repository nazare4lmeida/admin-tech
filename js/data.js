/**
 * data.js — Data layer: formations config, student schema, localStorage + Supabase CRUD
 */

(function () {
  "use strict";

  const STORAGE_KEY = "gt_students_v2";

  const FORMATIONS = [
    {
      id: "fullstack",
      label: "Fullstack",
      icon: "⚡",
      color: "#4f8aff",
      extra: ["fullstack"],
    },
    {
      id: "ia-generativa",
      label: "IA Generativa",
      icon: "🤖",
      color: "#a855f7",
      extra: [],
    },
    {
      id: "ia-soft-skills",
      label: "IA + Soft Skills",
      icon: "🧠",
      color: "#22c55e",
      extra: [],
    },
  ];

  const UNIVERSAL_FIELDS = [
    {
      key: "provaRecuperacao",
      label: "Prova de Recuperação",
      type: "select",
      options: ["", "Não fez", "Fez – Aprovado", "Fez – Reprovado"],
    },
    {
      key: "notaProvaRec",
      label: "Nota Rec.",
      type: "number",
      min: 0,
      max: 10,
      step: 0.1,
    },
    {
      key: "desafioPresenca",
      label: "Desafio Presença",
      type: "select",
      options: ["", "Não fez", "Fez – Aprovado", "Fez – Reprovado"],
    },
    {
      key: "pctDesafioPresenca",
      label: "% Desafio",
      type: "number",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "presencaFinalPlat",
      label: "Presença Final (%)",
      type: "number",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "reprovadoFalta",
      label: "Reprov. por Falta",
      type: "select",
      options: ["", "Não", "Sim"],
    },
    {
      key: "projetoFinal",
      label: "Projeto Final",
      type: "select",
      options: [
        "",
        "Não entregou",
        "Entregou – Aprovado",
        "Entregou – Reprovado",
      ],
    },
    {
      key: "progressoCurso",
      label: "Progresso (%)",
      type: "number",
      min: 0,
      max: 100,
      step: 0.1,
    },
    {
      key: "notaProjetoFinal",
      label: "Nota Final",
      type: "number",
      min: 0,
      max: 10,
      step: 0.1,
    },
  ];

  const EXTRA_FIELDS = {
    fullstack: [
      {
        key: "projetoFront",
        label: "Projeto Front-end",
        type: "select",
        options: [
          "",
          "Não entregou",
          "Entregou – Aprovado",
          "Entregou – Reprovado",
        ],
      },
      {
        key: "notaFront",
        label: "Nota Front",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        key: "projetoBack",
        label: "Projeto Back-end",
        type: "select",
        options: [
          "",
          "Não entregou",
          "Entregou – Aprovado",
          "Entregou – Reprovado",
        ],
      },
      {
        key: "notaBack",
        label: "Nota Back",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
      },
    ],
  };

  // ============================================================
  // STATUS CALCULATION
  // ============================================================
  function calcStatus(student) {
    // 1. Reprovado por falta — prioridade absoluta
    if (student.reprovadoFalta === "Sim") {
      return { key: "reprovado-falta", label: "Reprovado por Falta" };
    }

    // 2. Verifica se há projeto EFETIVAMENTE entregue
    //    "Não entregou" NÃO conta — só Aprovado ou Reprovado conta
    const projetoEntregue = (val) =>
      val === "Entregou – Aprovado" || val === "Entregou – Reprovado";

    const temProjetoEntregue =
      projetoEntregue(student.projetoFinal) ||
      projetoEntregue(student.projetoFront) ||
      projetoEntregue(student.projetoBack);

    // 3. Se não entregou nenhum projeto, o statusImportado é a fonte de verdade
    if (!temProjetoEntregue && student.statusImportado) {
      if (student.statusImportado === "certificado_conclusao")
        return { key: "aprovado", label: "Certificado de Conclusão" };
      if (student.statusImportado === "certificado_participacao")
        return { key: "participacao", label: "Certificado de Participação" };
      if (student.statusImportado === "certificado_vinculacao")
        return { key: "vinculacao", label: "Certificado de Vinculação" };
      if (student.statusImportado === "reprovado_falta")
        return { key: "reprovado-falta", label: "Reprovado por Falta" };
    }

    // 4. Sem nenhum dado relevante
    const temDados =
      student.provaRecuperacao ||
      student.projetoFinal ||
      student.projetoFront ||
      student.projetoBack ||
      student.reprovadoFalta ||
      student.presencaFinalPlat;

    if (!temDados) return { key: "vazio", label: "—" };

    // 5. Cálculo real — só chega aqui se tem projeto entregue
    let projectApproved = false;
    if (student.formacao === "fullstack") {
      const frontOk =
        student.projetoFront === "Entregou – Aprovado" &&
        parseFloat(student.notaFront || 0) >= 7;
      const backOk =
        student.projetoBack === "Entregou – Aprovado" &&
        parseFloat(student.notaBack || 0) >= 7;
      const finalOk =
        student.projetoFinal === "Entregou – Aprovado" &&
        parseFloat(student.notaProjetoFinal || 0) >= 7;
      projectApproved = (frontOk && backOk) || finalOk;
    } else {
      projectApproved =
        student.projetoFinal === "Entregou – Aprovado" &&
        parseFloat(student.notaProjetoFinal || 0) >= 7;
    }

    if (projectApproved)
      return { key: "aprovado", label: "Certificado de Conclusão" };

    // 6. Prova de recuperação aprovada
    const recApproved =
      student.provaRecuperacao === "Fez – Aprovado" &&
      parseFloat(student.notaProvaRec || 0) >= 6;

    if (recApproved)
      return { key: "participacao", label: "Certificado de Participação" };

    // 7. Fallback final: respeita statusImportado se existir
    if (student.statusImportado === "certificado_participacao")
      return { key: "participacao", label: "Certificado de Participação" };
    if (student.statusImportado === "certificado_conclusao")
      return { key: "aprovado", label: "Certificado de Conclusão" };

    return { key: "vinculacao", label: "Certificado de Vinculação" };
  }

  // ============================================================
  // NAME UTILITIES
  // ============================================================
  function normalizeName(name) {
    return (name || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }
  function getNameParts(name) {
    return normalizeName(name).split(" ").filter(Boolean);
  }

  function isSimilarName(a, b) {
    return normalizeName(a) === normalizeName(b);
  }

  function chooseBestName(existingName, importedName) {
    const e = (existingName || "").trim();
    const i = (importedName || "").trim();
    if (!e) return i;
    if (!i) return e;
    return getNameParts(i).length > getNameParts(e).length ? i : e;
  }

  function normalizeImportedStatus(status) {
    const s = normalizeName(status);
    if (!s) return "";
    if (s.includes("reprovado por falta") || s.includes("falta"))
      return "reprovado_falta";
    if (s.includes("conclusao") || s.includes("conclusão"))
      return "certificado_conclusao";
    if (s.includes("participacao") || s.includes("participação"))
      return "certificado_participacao";
    if (
      s.includes("vinculo") ||
      s.includes("vínculo") ||
      s.includes("vinculacao") ||
      s.includes("vinculação")
    )
      return "certificado_vinculacao";
    return "";
  }

  function applyImportedStatus(student, statusImportado) {
    const status = normalizeImportedStatus(statusImportado);
    if (!status) return;
    student.statusImportado = status;
    student.reprovadoFalta = status === "reprovado_falta" ? "Sim" : "Não";
  }

  // ============================================================
  // LOCAL STORAGE
  // ============================================================
  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function _getLocal(fid) {
    return loadAll()[fid] || [];
  }
  function _saveLocal(fid, students) {
    const all = loadAll();
    all[fid] = students;
    saveAll(all);
  }

  // ============================================================
  // UNIFIED CRUD
  // ============================================================
  function getStudents(formationId) {
    if (window.SB && SB.enabled()) return SB.getStudents(formationId);
    return Promise.resolve(_getLocal(formationId));
  }

  function saveStudents(formationId, students) {
    _saveLocal(formationId, students);
  }

  async function addStudent(formationId, name) {
    const id =
      "stu_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const student = { id, nome: name || "", formacao: formationId };
    if (window.SB && SB.enabled()) await SB.upsertStudent(formationId, student);
    const students = _getLocal(formationId);
    students.push(student);
    _saveLocal(formationId, students);
    return id;
  }

  async function updateField(formationId, studentId, field, value) {
    if (window.SB && SB.enabled())
      await SB.updateField(formationId, studentId, field, value);
    const students = _getLocal(formationId);
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx !== -1) {
      students[idx][field] = value;
      _saveLocal(formationId, students);
    }
  }

  async function deleteStudent(formationId, studentId) {
    if (window.SB && SB.enabled())
      await SB.deleteStudent(formationId, studentId);
    _saveLocal(
      formationId,
      _getLocal(formationId).filter((s) => s.id !== studentId),
    );
  }

  async function deleteMultiple(formationId, studentIds) {
    if (!studentIds.length) return;
    if (window.SB && SB.enabled())
      await SB.deleteMultiple(formationId, studentIds);
    const idSet = new Set(studentIds);
    _saveLocal(
      formationId,
      _getLocal(formationId).filter((s) => !idSet.has(s.id)),
    );
  }

  async function importStudents(formationId, rows) {
    if (window.SB && SB.enabled()) {
      const result = await SB.bulkUpsert(formationId, rows);
      const fresh = await SB.getStudents(formationId);
      _saveLocal(formationId, fresh);
      return result;
    }
    const existing = _getLocal(formationId);
    let added = 0,
      updated = 0;
    rows.forEach((row) => {
      const importedName = (row.nome || "").trim();
      if (!importedName) return;
      const match = existing.find((s) => isSimilarName(s.nome, importedName));
      if (match) {
        match.nome = chooseBestName(match.nome, importedName);
        UNIVERSAL_FIELDS.forEach((f) => {
          if (row[f.key] !== undefined && row[f.key] !== "")
            match[f.key] = row[f.key];
        });
        Object.values(EXTRA_FIELDS)
          .flat()
          .forEach((f) => {
            if (row[f.key] !== undefined && row[f.key] !== "")
              match[f.key] = row[f.key];
          });
        if (row.statusImportado)
          applyImportedStatus(match, row.statusImportado);
        updated++;
      } else {
        const id =
          "stu_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        const student = { id, formacao: formationId, nome: importedName };
        UNIVERSAL_FIELDS.forEach((f) => {
          if (row[f.key] !== undefined && row[f.key] !== "")
            student[f.key] = row[f.key];
        });
        Object.values(EXTRA_FIELDS)
          .flat()
          .forEach((f) => {
            if (row[f.key] !== undefined && row[f.key] !== "")
              student[f.key] = row[f.key];
          });
        if (row.statusImportado)
          applyImportedStatus(student, row.statusImportado);
        existing.push(student);
        added++;
      }
    });
    _saveLocal(formationId, existing);
    return { added, updated };
  }

  async function moveStudentToFormation(fromId, toId, student) {
    if (window.SB && SB.enabled()) await SB.moveStudent(fromId, toId, student);
    _saveLocal(
      fromId,
      _getLocal(fromId).filter((s) => s.id !== student.id),
    );
    student.formacao = toId;
    const to = _getLocal(toId);
    const idx = to.findIndex((s) => s.id === student.id);
    if (idx !== -1) to[idx] = student;
    else to.push(student);
    _saveLocal(toId, to);
  }

  async function getAllStudentsWithStatus() {
    const result = [];
    for (const f of FORMATIONS) {
      let students;
      if (window.SB && SB.enabled()) {
        students = await SB.getStudents(f.id);
        _saveLocal(f.id, students);
      } else {
        students = _getLocal(f.id);
      }
      students.forEach((s) =>
        result.push({ ...s, _status: calcStatus(s), _formationLabel: f.label }),
      );
    }
    return result;
  }


  // ============================================================
  // NOTA MÉDIA (para ranking top 50)
  // Para Fullstack: média de notaFront e notaBack (se entregues)
  // Para outras: notaProjetoFinal
  // ============================================================
  function calcNotaMedia(student) {
    const formacao = student.formacao || "";
    if (formacao === "fullstack") {
      const nf = parseFloat(student.notaFront);
      const nb = parseFloat(student.notaBack);
      const nfinal = parseFloat(student.notaProjetoFinal);
      const notas = [];
      if (!isNaN(nf) && (student.projetoFront === "Entregou – Aprovado" || student.projetoFront === "Entregou – Reprovado")) notas.push(nf);
      if (!isNaN(nb) && (student.projetoBack === "Entregou – Aprovado" || student.projetoBack === "Entregou – Reprovado")) notas.push(nb);
      if (!isNaN(nfinal) && (student.projetoFinal === "Entregou – Aprovado" || student.projetoFinal === "Entregou – Reprovado")) notas.push(nfinal);
      if (notas.length === 0) return null;
      return notas.reduce((a, b) => a + b, 0) / notas.length;
    } else {
      const n = parseFloat(student.notaProjetoFinal);
      if (isNaN(n)) return null;
      return n;
    }
  }

  // ============================================================
  // RANKING TOP 50 — retorna array com medalha atribuída
  // Ordena por nota média DESC, desempate por progressoCurso DESC
  // Top 10 = ouro, 11-25 = prata, 26-50 = bronze
  // Só alunos com nota média calculável entram no ranking
  // ============================================================
  function calcRanking(students) {
    const elegíveis = students
      .map(s => ({ ...s, _media: calcNotaMedia(s) }))
      .filter(s => s._media !== null)
      .sort((a, b) => {
        // 1º critério: nota média DESC
        if (b._media !== a._media) return b._media - a._media;
        // 2º critério: presença final DESC
        const presA = parseFloat(a.presencaFinalPlat) || 0;
        const presB = parseFloat(b.presencaFinalPlat) || 0;
        if (presB !== presA) return presB - presA;
        // 3º critério: progresso no curso DESC
        const progA = parseFloat(a.progressoCurso) || 0;
        const progB = parseFloat(b.progressoCurso) || 0;
        return progB - progA;
      });

    const result = new Map();
    elegíveis.forEach((s, i) => {
      const pos = i + 1;
      let medalha = null;
      if (pos <= 10)       medalha = "ouro";
      else if (pos <= 25)  medalha = "prata";
      else if (pos <= 50)  medalha = "bronze";
      if (medalha) result.set(s.id, { medalha, posicao: pos, media: s._media });
    });
    return result; // Map<id, {medalha, posicao, media}>
  }

  window.GT = {
    FORMATIONS,
    UNIVERSAL_FIELDS,
    EXTRA_FIELDS,
    calcStatus,
    calcNotaMedia,
    calcRanking,
    isSimilarName,
    chooseBestName,
    applyImportedStatus,
    getStudents,
    saveStudents,
    addStudent,
    updateField,
    deleteStudent,
    deleteMultiple,
    importStudents,
    moveStudentToFormation,
    getAllStudentsWithStatus,
  };
})();
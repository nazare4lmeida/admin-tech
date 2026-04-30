/**
 * data.js — Data layer: formations config, student schema, localStorage + Supabase CRUD
 */

(function () {
  "use strict";

  const STORAGE_KEY = "gt_students_v2";

  // Formações base (sempre presentes)
  const BASE_FORMATIONS = [
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
      extra: ["ia-generativa"],
    },
    {
      id: "ia-soft-skills",
      label: "IA + Soft Skills",
      icon: "🧠",
      color: "#22c55e",
      extra: ["ia-soft-skills"],
    },
    {
      id: "presencial-ia-gen",
      label: "Presencial IA Gen",
      icon: "🏫",
      color: "#f59e0b",
      extra: ["presencial"],
      presencial: true,
    },
    {
      id: "presencial-ia-soft",
      label: "Presencial IA Soft",
      icon: "🏫",
      color: "#10b981",
      extra: ["presencial"],
      presencial: true,
    },
  ];

  // Lista dinâmica — inclui turmas customizadas carregadas do Supabase
  let FORMATIONS = [...BASE_FORMATIONS];

  async function loadDynamicFormations() {
    if (!(window.SB && SB.enabled())) return;
    try {
      const turmas = await SB.getTurmasCustomizadas();
      const extras = turmas.map((t) => ({
        id: t.id,
        label: t.label,
        icon: t.icon || "📚",
        color: t.color || "#6366f1",
        extra: ["presencial"],
        presencial: true,
        dynamic: true,
        tableName: t.table_name,
      }));
      FORMATIONS = [...BASE_FORMATIONS, ...extras];
    } catch (e) {
      console.warn("Erro ao carregar turmas customizadas:", e);
    }
  }

  async function createDynamicFormation({ label, icon, color }) {
    const id = "turma_" + Date.now();
    const tableName = "alunos_" + id.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    await SB.createTurmaCustomizada({ id, label, icon, color, tableName });
    await loadDynamicFormations();
    return id;
  }

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
      {
        key: "progressoCurso",
        label: "Progresso (%)",
        type: "number",
        min: 0,
        max: 100,
        step: 0.1,
      },
    ],
    "ia-generativa": [
      {
        key: "notaProjetoFinal",
        label: "Nota Proj. Final",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        key: "progressoCurso",
        label: "Progresso (%)",
        type: "number",
        min: 0,
        max: 100,
        step: 0.1,
      },
    ],
    "ia-soft-skills": [
      {
        key: "notaProjetoFinal",
        label: "Nota Proj. Final",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        key: "progressoCurso",
        label: "Progresso (%)",
        type: "number",
        min: 0,
        max: 100,
        step: 0.1,
      },
    ],
    presencial: [
      {
        key: "sede",
        label: "Sede",
        type: "select",
        options: ["", "Aldeota", "Bezerra", "Sul"],
      },
      {
        key: "presencaFinalPlat",
        label: "Frequência (%)",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: "notaProjetoFinal",
        label: "Nota Final",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        key: "progressoCurso",
        label: "Progresso (%)",
        type: "number",
        min: 0,
        max: 100,
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
    const projetoEntregue = (val) =>
      val === "Entregou – Aprovado" || val === "Entregou – Reprovado";

    const temProjetoEntregue =
      projetoEntregue(student.projetoFinal) ||
      projetoEntregue(student.projetoFront) ||
      projetoEntregue(student.projetoBack);

    // 3. Sem nenhum dado real preenchido — usa statusImportado se existir
    const temDados =
      student.provaRecuperacao ||
      student.projetoFinal ||
      student.projetoFront ||
      student.projetoBack ||
      student.reprovadoFalta ||
      student.presencaFinalPlat;

    if (!temDados) {
      if (!student.statusImportado) return { key: "vazio", label: "—" };
      if (student.statusImportado === "certificado_conclusao")
        return { key: "aprovado", label: "Certificado de Conclusão" };
      if (student.statusImportado === "certificado_participacao")
        return { key: "participacao", label: "Certificado de Participação" };
      if (student.statusImportado === "certificado_vinculacao")
        return { key: "vinculacao", label: "Certificado de Vinculação" };
      if (student.statusImportado === "reprovado_falta")
        return { key: "reprovado-falta", label: "Reprovado por Falta" };
      return { key: "vazio", label: "—" };
    }

    // 4. Tem dados reais — recuperação sem projeto entregue
    if (!temProjetoEntregue) {
      const recApproved =
        student.provaRecuperacao === "Fez – Aprovado" &&
        parseFloat(student.notaProvaRec || 0) >= 6;
      if (recApproved)
        return { key: "participacao", label: "Certificado de Participação" };
    }

    // 5. Cálculo real de projeto
    const presencaOk = parseFloat(student.presencaFinalPlat || 0) >= 75;
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
    } else if (
      student.formacao &&
      (student.formacao.startsWith("presencial") ||
        student.formacao.startsWith("turma_"))
    ) {
      // Presencial — regras próprias
      const notaOk = parseFloat(student.notaProjetoFinal || 0) >= 7;

      // Conclusão: presença >= 75% + nota >= 7
      if (presencaOk && notaOk)
        return { key: "aprovado", label: "Certificado de Conclusão" };

      // Participação: nota >= 7 (mesmo sem presença mínima)
      if (notaOk)
        return { key: "participacao", label: "Certificado de Participação" };

      // Sem projeto aprovado ou sem nota — vinculação
      return { key: "vinculacao", label: "Certificado de Vinculação" };
    } else {
      // IA Generativa e IA + Soft Skills
      const projetoOk =
        student.projetoFinal === "Entregou – Aprovado" &&
        parseFloat(student.notaProjetoFinal || 0) >= 7;
      const recOk =
        student.provaRecuperacao === "Fez – Aprovado" &&
        parseFloat(student.notaProvaRec || 0) >= 6;

      // Conclusão: presença >= 75% + projeto aprovado (com ou sem prova)
      if (presencaOk && projetoOk)
        return { key: "aprovado", label: "Certificado de Conclusão" };

      // Participação: presença >= 75% + prova aprovada (mesmo sem projeto)
      if (presencaOk && recOk)
        return { key: "participacao", label: "Certificado de Participação" };

      // Nenhum critério atingido
      return { key: "vinculacao", label: "Certificado de Vinculação" };
    }

    if (projectApproved)
      return { key: "aprovado", label: "Certificado de Conclusão" };

    // 6. Projeto entregue mas não aprovado — verifica recuperação
    const recApproved =
      student.provaRecuperacao === "Fez – Aprovado" &&
      parseFloat(student.notaProvaRec || 0) >= 6;
    if (recApproved)
      return { key: "participacao", label: "Certificado de Participação" };

    // 7. Nenhuma condição de aprovação — vinculação
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

    if (formacao.startsWith("presencial") || formacao.startsWith("turma_")) {
      const nota = parseFloat(student.notaProjetoFinal);
      const freq = parseFloat(student.presencaFinalPlat || 0);
      const prog = parseFloat(student.progressoCurso || 0);
      if (nota !== 10 || freq < 80 || prog < 80) return null;
      return nota;
    }

    // Se tem notaProjetoFinal preenchida, usa direto (vale para todas as formações)
    const nFinal = parseFloat(student.notaProjetoFinal);
    if (!isNaN(nFinal) && nFinal > 0) return nFinal;

    // Fullstack sem notaProjetoFinal: calcula média de front + back
    if (formacao === "fullstack") {
      const nf = parseFloat(student.notaFront);
      const nb = parseFloat(student.notaBack);
      const notas = [];
      if (
        !isNaN(nf) &&
        (student.projetoFront === "Entregou – Aprovado" ||
          student.projetoFront === "Entregou – Reprovado")
      )
        notas.push(nf);
      if (
        !isNaN(nb) &&
        (student.projetoBack === "Entregou – Aprovado" ||
          student.projetoBack === "Entregou – Reprovado")
      )
        notas.push(nb);
      if (notas.length < 2) return null;
      return notas.reduce((a, b) => a + b, 0) / notas.length;
    }

    return null;
  }

  // ============================================================
  // RANKING TOP 50 — proporcional entre as 3 formações
  // Vagas fixas por formação e medalha:
  //   Ouro(10):   fullstack=5, ia-generativa=3, ia-soft-skills=2
  //   Prata(15):  fullstack=7, ia-generativa=5, ia-soft-skills=3
  //   Bronze(25): fullstack=12, ia-generativa=10, ia-soft-skills=3
  // Sobras redistribuídas proporcionalmente entre as demais formações
  // Critérios de ordenação: nota média > presença > progresso
  // ============================================================
  function calcRanking(students) {
    // Vagas fixas por formação e medalha — sem redistribuição de sobras
    const VAGAS = {
      ouro: {
        fullstack: 3,
        "ia-generativa": 3,
        "ia-soft-skills": 2,
        "presencial-ia-gen": 1,
        "presencial-ia-soft": 1,
      },
      prata: {
        fullstack: 6,
        "ia-generativa": 4,
        "ia-soft-skills": 3,
        "presencial-ia-gen": 1,
        "presencial-ia-soft": 1,
      },
      bronze: {
        fullstack: 11,
        "ia-generativa": 9,
        "ia-soft-skills": 3,
        "presencial-ia-gen": 1,
        "presencial-ia-soft": 1,
      },
    };

    // Função de ordenação por nota > presença > progresso
    function ordenar(lista) {
      return lista.sort((a, b) => {
        if (b._media !== a._media) return b._media - a._media;
        const presA = parseFloat(a.presencaFinalPlat) || 0;
        const presB = parseFloat(b.presencaFinalPlat) || 0;
        if (presB !== presA) return presB - presA;
        const progA = parseFloat(a.progressoCurso) || 0;
        const progB = parseFloat(b.progressoCurso) || 0;
        return progB - progA;
      });
    }

    // Separa elegíveis por formação (só quem tem nota média calculável)
    const porFormacao = {};
    FORMATIONS.forEach((f) => {
      porFormacao[f.id] = [];
    });
    students
      .map((s) => ({ ...s, _media: calcNotaMedia(s) }))
      .filter((s) => s._media !== null)
      .forEach((s) => {
        if (porFormacao[s.formacao]) porFormacao[s.formacao].push(s);
      });
    // Ordena cada turma internamente
    Object.keys(porFormacao).forEach((fid) => ordenar(porFormacao[fid]));

    const result = new Map();
    const jaEscolhidos = new Set(); // ids já premiados em rodadas anteriores

    ["ouro", "prata", "bronze"].forEach((medalha) => {
      const vagasPorFormacao = { ...VAGAS[medalha] };
      const escolhidos = {};
      GT.FORMATIONS.forEach((f) => {
        escolhidos[f.id] = [];
      });
      let totalSobras = 0;

      // 1ª passagem: cada formação entrega seus melhores até o limite
      GT.FORMATIONS.forEach((f) => {
        const disponiveis = porFormacao[f.id].filter(
          (s) => !jaEscolhidos.has(s.id),
        );
        const vagas = vagasPorFormacao[f.id] || 0;
        escolhidos[f.id] = disponiveis.slice(0, vagas);
        totalSobras += Math.max(0, vagas - escolhidos[f.id].length);
      });

      // Registra medalhas e marca como escolhidos
      GT.FORMATIONS.forEach((f) => {
        (escolhidos[f.id] || []).forEach((s) => {
          jaEscolhidos.add(s.id);
          result.set(s.id, { medalha, media: s._media });
        });
      });
    });

    return result; // Map<id, {medalha, media}>
  }

  window.GT = {
    get FORMATIONS() {
      return FORMATIONS;
    },
    BASE_FORMATIONS,
    loadDynamicFormations,
    createDynamicFormation,
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

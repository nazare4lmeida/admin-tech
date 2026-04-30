(function () {
  "use strict";

  //CREDENCIAIS DO SUPABASE
  const SUPABASE_URL = window.ENV?.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || "";

  const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

  // Formation ID → Supabase table name
  const TABLE_MAP = {
    fullstack: "alunos_fullstack",
    "ia-generativa": "alunos_ia_generativa",
    "ia-soft-skills": "alunos_ia_soft_skills",
    "presencial-ia-gen": "alunos_presencial_ia_gen",
    "presencial-ia-soft": "alunos_presencial_ia_soft",
  };
  // Dynamic turmas added at runtime
  const DYNAMIC_TABLE_MAP = {};

  // ============================================================
  // FETCH WRAPPER
  // ============================================================
  async function sbFetch(path, options = {}) {
    const url = SUPABASE_URL + "/rest/v1" + path;
    const prefer = options._prefer || "return=representation";
    const method = options.method || "GET";
    const body = options.body;

    const res = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: prefer,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error("Supabase: " + (err.message || res.statusText));
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ============================================================
  // ROW MAPPING
  // ============================================================
  function toRow(student, formationId) {
    const isPresencial = formationId && (formationId.startsWith("presencial") || formationId.startsWith("turma_"));
    if (isPresencial) {
      return {
        id: student.id || undefined,
        nome: student.nome || "",
        formacao: formationId,
        sede: student.sede || null,
        presenca_final_plat: toNum(student.presencaFinalPlat),
        nota_projeto_final: toNum(student.notaProjetoFinal),
        progresso_curso: toNum(student.progressoCurso),
        status_importado: student.statusImportado || null,
      };
    }
    const row = {
      id: student.id || undefined,
      nome: student.nome || "",
      formacao: formationId,
      prova_recuperacao: student.provaRecuperacao || null,
      nota_prova_rec: toNum(student.notaProvaRec),
      desafio_presenca: student.desafioPresenca || null,
      pct_desafio_presenca: toNum(student.pctDesafioPresenca),
      presenca_final_plat: toNum(student.presencaFinalPlat),
      reprovado_falta: student.reprovadoFalta || null,
      projeto_final: student.projetoFinal || null,
      nota_projeto_final: toNum(student.notaProjetoFinal),
      progresso_curso: toNum(student.progressoCurso),
      status_importado: student.statusImportado || null,
    };
    if (formationId === "fullstack") {
      row.projeto_front = student.projetoFront || null;
      row.nota_front = toNum(student.notaFront);
      row.projeto_back = student.projetoBack || null;
      row.nota_back = toNum(student.notaBack);
    }
    return row;
  }

  function fromRow(row, formationId) {
    const fid = formationId || row.formacao;
    const isPresencial = fid && (fid.startsWith("presencial") || fid.startsWith("turma_"));
    if (isPresencial) {
      return {
        id: row.id,
        nome: row.nome || "",
        formacao: fid,
        sede: row.sede || "",
        presencaFinalPlat: row.presenca_final_plat ?? "",
        notaProjetoFinal: row.nota_projeto_final ?? "",
        progressoCurso: row.progresso_curso ?? "",
        statusImportado: row.status_importado || "",
      };
    }
    return {
      id: row.id,
      nome: row.nome || "",
      formacao: row.formacao || fid,
      provaRecuperacao: row.prova_recuperacao || "",
      notaProvaRec: row.nota_prova_rec ?? "",
      desafioPresenca: row.desafio_presenca || "",
      pctDesafioPresenca: row.pct_desafio_presenca ?? "",
      presencaFinalPlat: row.presenca_final_plat ?? "",
      reprovadoFalta: row.reprovado_falta || "",
      projetoFinal: row.projeto_final || "",
      notaProjetoFinal: row.nota_projeto_final ?? "",
      statusImportado: row.status_importado || "",
      projetoFront: row.projeto_front || "",
      notaFront: row.nota_front ?? "",
      projetoBack: row.projeto_back || "",
      notaBack: row.nota_back ?? "",
      progressoCurso: row.progresso_curso ?? "",
    };
  }

  function toNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // ============================================================
  // COLUMN MAP (JS key → DB column)
  // ============================================================
  const COL_MAP = {
    nome: "nome",
    formacao: "formacao",
    provaRecuperacao: "prova_recuperacao",
    notaProvaRec: "nota_prova_rec",
    desafioPresenca: "desafio_presenca",
    pctDesafioPresenca: "pct_desafio_presenca",
    presencaFinalPlat: "presenca_final_plat",
    reprovadoFalta: "reprovado_falta",
    projetoFinal: "projeto_final",
    notaProjetoFinal: "nota_projeto_final",
    statusImportado: "status_importado",
    projetoFront: "projeto_front",
    notaFront: "nota_front",
    projetoBack: "projeto_back",
    notaBack: "nota_back",
    progressoCurso: "progresso_curso",
    sede: "sede",
  };

  // ============================================================
  // PUBLIC API
  // ============================================================
  function enabled() {
    return isConfigured;
  }

  function getTable(formationId) {
    return TABLE_MAP[formationId] || DYNAMIC_TABLE_MAP[formationId] || null;
  }

  async function getStudents(formationId) {
    const table = getTable(formationId);
    if (!table) return [];
    const rows = await sbFetch(`/${table}?order=nome.asc`);
    return (rows || []).map(r => fromRow(r, formationId));
  }

  async function getAllStudents() {
    const results = [];
    for (const fid of Object.keys(TABLE_MAP)) {
      const rows = await getStudents(fid);
      rows.forEach((r) => results.push({ ...r, formacao: fid }));
    }
    return results;
  }

  async function upsertStudent(formationId, student) {
    const table = getTable(formationId);
    if (!table) throw new Error("Unknown formation: " + formationId);
    const row = toRow(student, formationId);
    const result = await sbFetch(`/${table}`, {
      method: "POST",
      _prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(row),
    });
    const saved = Array.isArray(result) ? result[0] : result;
    return fromRow(saved);
  }

  async function bulkUpsert(formationId, importedStudents) {
    const table = getTable(formationId);
    if (!table) throw new Error("Unknown formation: " + formationId);
    const existing = await getStudents(formationId);
    let added = 0,
      updated = 0;

    for (const imp of importedStudents) {
      const impName = (imp.nome || "").trim();
      if (!impName) continue;
      const normImp = impName
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ");
      const match = existing.find((e) => {
        const normE = (e.nome || "")
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9 ]/g, "")
          .replace(/\s+/g, " ");
        return normE === normImp;
      });

      if (match) {
        const merged = { ...match };
        merged.nome = GT.chooseBestName(match.nome, impName);
        Object.keys(imp).forEach((k) => {
          if (k !== "id" && imp[k] !== undefined && imp[k] !== "")
            merged[k] = imp[k];
        });
        if (imp.statusImportado)
          GT.applyImportedStatus(merged, imp.statusImportado);
        merged.id = match.id;
        await upsertStudent(formationId, merged);
        updated++;
      } else {
        const newStu = { ...imp, formacao: formationId };
        if (!newStu.id)
          newStu.id =
            "stu_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        if (imp.statusImportado)
          GT.applyImportedStatus(newStu, imp.statusImportado);
        await upsertStudent(formationId, newStu);
        added++;
      }
    }
    return { added, updated };
  }

  async function updateField(formationId, studentId, field, value) {
    const table = getTable(formationId);
    if (!table) return;
    const col = COL_MAP[field];
    if (!col) return;
    const body = {};
    body[col] = value === "" ? null : value;
    await sbFetch(`/${table}?id=eq.${encodeURIComponent(studentId)}`, {
      method: "PATCH",
      _prefer: "return=minimal",
      body: JSON.stringify(body),
    });
  }

  async function deleteStudent(formationId, studentId) {
    const table = getTable(formationId);
    if (!table) return;
    await sbFetch(`/${table}?id=eq.${encodeURIComponent(studentId)}`, {
      method: "DELETE",
      _prefer: "return=minimal",
    });
  }

  async function deleteMultiple(formationId, studentIds) {
    if (!studentIds.length) return;
    const table = getTable(formationId);
    if (!table) return;
    const ids = studentIds.map((id) => `"${id}"`).join(",");
    await sbFetch(`/${table}?id=in.(${ids})`, {
      method: "DELETE",
      _prefer: "return=minimal",
    });
  }

  async function moveStudent(fromFormation, toFormation, student) {
    await deleteStudent(fromFormation, student.id);
    student.formacao = toFormation;
    await upsertStudent(toFormation, student);
  }

  // ============================================================
  // TURMAS CUSTOMIZADAS
  // ============================================================
  async function getTurmasCustomizadas() {
    const rows = await sbFetch("/turmas_customizadas?order=created_at.asc");
    if (!rows || !rows.length) return [];
    // Register dynamic tables
    rows.forEach(t => { DYNAMIC_TABLE_MAP[t.id] = t.table_name; });
    return rows;
  }

  async function createTurmaCustomizada({ id, label, icon, color, tableName }) {
    // 1. Create the table via RPC (requires a Supabase function) or insert metadata
    // We insert metadata; admin must create the table manually via SQL
    await sbFetch("/turmas_customizadas", {
      method: "POST",
      _prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify({ id, label, icon, color, table_name: tableName, tipo: "presencial" }),
    });
    DYNAMIC_TABLE_MAP[id] = tableName;
  }

  window.SB = {
    enabled,
    getStudents,
    getAllStudents,
    upsertStudent,
    bulkUpsert,
    updateField,
    deleteStudent,
    deleteMultiple,
    moveStudent,
    getTurmasCustomizadas,
    createTurmaCustomizada,
  };
})();

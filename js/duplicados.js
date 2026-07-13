/**
 * duplicados.js — Detecção de alunos duplicados ou com nomes muito semelhantes
 *
 * Estratégia:
 *  1. Normaliza nomes (minúsculas, sem acentos, espaços colapsados) — reutiliza
 *     a mesma lógica de GT.isSimilarName.
 *  2. Agrupa por similaridade:
 *     - "identico": nomes iguais após normalização (só mudam acentos/caixa/espaços)
 *     - "semelhante": similaridade de Levenshtein >= LIMIAR (default 0.85)
 *       ou mesmos tokens em ordem diferente (ex: "Silva João" x "João Silva")
 *  3. Para não comparar todo mundo com todo mundo, usa "blocking": só compara
 *     pares que compartilham pelo menos um token (nome ou sobrenome).
 *
 * Exposto em window.Duplicados = { open }
 */

(function () {
  "use strict";

  const LIMIAR_SIMILARIDADE = 0.85; // 85%

  // ============================================================
  // NORMALIZAÇÃO E SIMILARIDADE
  // ============================================================
  function normalize(name) {
    return (name || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function tokens(name) {
    return normalize(name).split(" ").filter(Boolean);
  }

  /** Distância de Levenshtein com early-exit (duas linhas de memória). */
  function levenshtein(a, b) {
    if (a === b) return 0;
    const la = a.length,
      lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;
    let prev = new Array(lb + 1);
    let curr = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      curr[0] = i;
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= lb; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[lb];
  }

  /** Similaridade 0..1 entre dois nomes normalizados. */
  function similarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    // Otimização: se a diferença de tamanho já impede atingir o limiar, pula
    if (Math.abs(a.length - b.length) / maxLen > 1 - LIMIAR_SIMILARIDADE)
      return 0;
    return 1 - levenshtein(a, b) / maxLen;
  }

  /** Mesmos tokens em ordem diferente ("Silva João" x "João Silva"). */
  function sameTokensReordered(na, nb) {
    const ta = tokens(na).sort().join(" ");
    const tb = tokens(nb).sort().join(" ");
    return ta.length > 0 && ta === tb;
  }

  /**
   * Compara dois alunos. Retorna:
   *  { tipo: "identico" }               — iguais após normalização
   *  { tipo: "semelhante", score: 0.9 } — parecidos (Levenshtein/reordenação)
   *  null                                — não são parecidos
   */
  function comparar(nomeA, nomeB) {
    const na = normalize(nomeA);
    const nb = normalize(nomeB);
    if (!na || !nb) return null;
    if (na === nb) return { tipo: "identico" };
    if (sameTokensReordered(na, nb)) return { tipo: "semelhante", score: 1 };
    const score = similarity(na, nb);
    if (score >= LIMIAR_SIMILARIDADE) return { tipo: "semelhante", score };
    return null;
  }

  // ============================================================
  // DETECÇÃO DE GRUPOS (union-find + blocking por token)
  // ============================================================
  function findGroups(entries) {
    // entries: [{ student, formation }]
    const n = entries.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a, b) => {
      const ra = find(a),
        rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    // Blocking: indexa por token para não comparar O(n²) cego
    const blocks = new Map();
    entries.forEach((e, i) => {
      const seen = new Set();
      tokens(e.student.nome).forEach((t) => {
        if (t.length < 2 || seen.has(t)) return; // ignora iniciais soltas
        seen.add(t);
        if (!blocks.has(t)) blocks.set(t, []);
        blocks.get(t).push(i);
      });
    });

    const matchInfo = new Map(); // "i-j" -> resultado de comparar()
    const comparedPairs = new Set();
    blocks.forEach((idxs) => {
      if (idxs.length < 2 || idxs.length > 400) return; // bloco gigante = token genérico
      for (let x = 0; x < idxs.length; x++) {
        for (let y = x + 1; y < idxs.length; y++) {
          const i = idxs[x],
            j = idxs[y];
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (comparedPairs.has(key)) continue;
          comparedPairs.add(key);
          const res = comparar(entries[i].student.nome, entries[j].student.nome);
          if (res) {
            union(i, j);
            matchInfo.set(key, res);
          }
        }
      }
    });

    // Monta grupos
    const groupsMap = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groupsMap.has(root)) groupsMap.set(root, []);
      groupsMap.get(root).push(i);
    }

    const groups = [];
    groupsMap.forEach((idxs) => {
      if (idxs.length < 2) return;
      // Tipo do grupo: se TODOS os pares são idênticos → "identico", senão "semelhante"
      let allIdentical = true;
      let minScore = 1;
      for (let x = 0; x < idxs.length; x++) {
        for (let y = x + 1; y < idxs.length; y++) {
          const key =
            idxs[x] < idxs[y]
              ? `${idxs[x]}-${idxs[y]}`
              : `${idxs[y]}-${idxs[x]}`;
          const info = matchInfo.get(key);
          if (!info || info.tipo !== "identico") allIdentical = false;
          if (info && info.tipo === "semelhante")
            minScore = Math.min(minScore, info.score);
        }
      }
      groups.push({
        tipo: allIdentical ? "identico" : "semelhante",
        score: allIdentical ? 1 : minScore,
        entries: idxs.map((i) => entries[i]),
      });
    });

    // Idênticos primeiro, depois por score decrescente
    groups.sort((a, b) =>
      a.tipo === b.tipo ? b.score - a.score : a.tipo === "identico" ? -1 : 1,
    );
    return groups;
  }

  // ============================================================
  // MODAL
  // ============================================================
  let _crossFormations = false;

  async function scanAndRender(listEl, countEl) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3)">⏳ Analisando alunos...</div>`;

    // Carrega alunos de todas as formações
    const entries = [];
    for (const f of GT.FORMATIONS) {
      let students = [];
      try {
        students = await GT.getStudents(f.id);
      } catch {
        students = [];
      }
      students.forEach((s) => {
        if ((s.nome || "").trim()) entries.push({ student: s, formation: f });
      });
    }

    let groups;
    if (_crossFormations) {
      groups = findGroups(entries);
    } else {
      // Analisa cada turma separadamente
      groups = [];
      GT.FORMATIONS.forEach((f) => {
        const sub = entries.filter((e) => e.formation.id === f.id);
        groups.push(...findGroups(sub));
      });
      groups.sort((a, b) =>
        a.tipo === b.tipo ? b.score - a.score : a.tipo === "identico" ? -1 : 1,
      );
    }

    countEl.textContent = groups.length
      ? `${groups.length} grupo(s) suspeito(s) encontrado(s)`
      : "Nenhum duplicado encontrado 🎉";

    if (!groups.length) {
      listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">
        ✅ Nenhum aluno duplicado ou com nome muito semelhante foi encontrado${_crossFormations ? "" : " dentro de cada turma"}.
      </div>`;
      return;
    }

    listEl.innerHTML = groups
      .map((g, gi) => {
        const badge =
          g.tipo === "identico"
            ? `<span class="dup-badge dup-badge-identico">Idênticos (acentos/caixa)</span>`
            : `<span class="dup-badge dup-badge-semelhante">≈ ${Math.round(g.score * 100)}% semelhantes</span>`;
        const rows = g.entries
          .map(
            (e) => `
          <div class="dup-row" data-sid="${e.student.id}" data-fid="${e.formation.id}">
            <span class="dup-name">${escapeHtml(e.student.nome)}</span>
            <span class="dup-turma">${e.formation.icon || ""} ${escapeHtml(e.formation.label)}</span>
            <span class="dup-extra">${e.student.email ? escapeHtml(e.student.email) : ""}</span>
            <button class="dup-del-btn" title="Excluir este registro">🗑 Excluir</button>
          </div>`,
          )
          .join("");
        return `<div class="dup-group" data-gi="${gi}">
          <div class="dup-group-head">Grupo ${gi + 1} ${badge}</div>
          ${rows}
        </div>`;
      })
      .join("");

    // Handler de exclusão (delegação)
    listEl.querySelectorAll(".dup-del-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".dup-row");
        const sid = row.dataset.sid;
        const fid = row.dataset.fid;
        const nome = row.querySelector(".dup-name").textContent;
        if (!confirm(`Excluir o registro "${nome}"?\nEssa ação não pode ser desfeita.`)) return;
        try {
          await GT.deleteStudent(fid, sid);
          row.remove();
          toast(`"${nome}" excluído.`, "success");
          // Se sobrou só 1 no grupo, remove o grupo da lista
          const group = listEl.querySelector(`.dup-group[data-gi]`);
          listEl.querySelectorAll(".dup-group").forEach((gEl) => {
            if (gEl.querySelectorAll(".dup-row").length < 2) gEl.remove();
          });
          if (!listEl.querySelector(".dup-group")) {
            countEl.textContent = "Nenhum duplicado restante 🎉";
            listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">✅ Todos os duplicados foram resolvidos.</div>`;
          }
          // Atualiza a tabela se a turma ativa foi afetada
          if (window.Table) Table.updateAllBadges?.();
          document.dispatchEvent(
            new CustomEvent("gt:studentDeleted", { detail: { fid, sid } }),
          );
        } catch (err) {
          toast("Erro ao excluir: " + err.message, "error");
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function open() {
    const existing = document.getElementById("dupModalOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "dupModalOverlay";
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:640px;width:92vw">
        <button class="modal-close" id="dupModalClose">✕</button>
        <div class="modal-header">
          <div class="modal-icon">👥</div>
          <div class="modal-title-wrap">
            <div class="modal-title">Alunos Duplicados</div>
            <div class="modal-subtitle">Nomes iguais ou muito semelhantes (ignora acentos, maiúsculas e ordem)</div>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2);margin:6px 0 12px;cursor:pointer">
          <input type="checkbox" id="dupCrossChk" ${_crossFormations ? "checked" : ""} />
          Comparar também entre turmas diferentes
        </label>
        <div id="dupCount" style="font-size:12.5px;font-weight:600;color:var(--text2);margin-bottom:8px"></div>
        <div id="dupList" style="max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px"></div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" id="dupModalCancel">Fechar</button>
          <button class="btn-modal-apply" id="dupRescan">🔄 Reanalisar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("dupModalClose").onclick = close;
    document.getElementById("dupModalCancel").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const listEl = document.getElementById("dupList");
    const countEl = document.getElementById("dupCount");

    document.getElementById("dupCrossChk").addEventListener("change", (e) => {
      _crossFormations = e.target.checked;
      scanAndRender(listEl, countEl);
    });
    document
      .getElementById("dupRescan")
      .addEventListener("click", () => scanAndRender(listEl, countEl));

    scanAndRender(listEl, countEl);
  }

  window.Duplicados = { open };
})();
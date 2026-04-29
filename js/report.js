/**
 * report.js — Módulo de Relatório Gerencial v2
 * Acréscimos v2:
 *  - Seção de Progresso (geral + por turma)
 *  - Seção de Top 50 com contagem de medalhas por turma
 *  - Exportar relatório como HTML estático (colorido)
 *  - Exportar relatório como HTML editável
 *  - Correção de impressão PDF (página completa via @media print)
 */

(function () {
  "use strict";

  const META_KEY = "gt_report_meta_v1";

  function loadMeta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  const DEFAULT_META = {
    titulo: "Relatório de Presença e Desempenho",
    subtitulo: "Formações Digitais · Prestação de Contas",
    orgao: "IEL Ceará — Programa Geração Tech",
    fullstack: { periodo: "", aulas: "", status: "encerrada" },
    "ia-generativa": { periodo: "", aulas: "", status: "encerrada" },
    "ia-soft-skills": { periodo: "", aulas: "", status: "em andamento" },
    observacoes: "",
  };

  function calcStats(students) {
    const total = students.length;
    if (total === 0) return null;

    const presencas = students.map((s) => parseFloat(s.presencaFinalPlat) || 0);
    const ativos = presencas.filter((p) => p > 0);
    const comMinimo = presencas.filter((p) => p >= 75);
    const cem = presencas.filter((p) => p >= 100);
    const soma = presencas.reduce((a, b) => a + b, 0);
    const somaAtivos = ativos.reduce((a, b) => a + b, 0);
    const freqMedia = total > 0 ? soma / total : 0;
    const freqMediaAtivos = ativos.length > 0 ? somaAtivos / ativos.length : 0;

    const faixas = {
      "100+": presencas.filter((p) => p >= 100).length,
      "75-99": presencas.filter((p) => p >= 75 && p < 100).length,
      "50-74": presencas.filter((p) => p >= 50 && p < 75).length,
      "25-49": presencas.filter((p) => p >= 25 && p < 50).length,
      "1-24": presencas.filter((p) => p >= 1 && p < 25).length,
      0: presencas.filter((p) => p === 0).length,
    };

    const statusCounts = {};
    students.forEach((s) => {
      const st = GT.calcStatus(s).key;
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    // Progresso do curso
    const progressos = students
      .map((s) => parseFloat(s.progressoCurso))
      .filter((n) => !isNaN(n) && n > 0);
    const progressoMedia = progressos.length
      ? progressos.reduce((a, b) => a + b, 0) / progressos.length
      : null;
    const progressoFaixas = {
      "75-100": progressos.filter((p) => p >= 75).length,
      "50-74": progressos.filter((p) => p >= 50 && p < 75).length,
      "25-49": progressos.filter((p) => p >= 25 && p < 50).length,
      "1-24": progressos.filter((p) => p >= 1 && p < 25).length,
      0: students.filter((s) => !parseFloat(s.progressoCurso)).length,
    };

    const notasRec = students
      .map((s) => parseFloat(s.notaProvaRec))
      .filter((n) => !isNaN(n));
    const notasFront = students
      .map((s) => parseFloat(s.notaFront))
      .filter((n) => !isNaN(n));
    const notasBack = students
      .map((s) => parseFloat(s.notaBack))
      .filter((n) => !isNaN(n));
    const notasFinal = students
      .map((s) => parseFloat(s.notaProjetoFinal))
      .filter((n) => !isNaN(n));

    function avg(arr) {
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    }
    function pct(n) {
      return total > 0 ? (n / total) * 100 : 0;
    }

    const fizRec = students.filter(
      (s) => s.provaRecuperacao && s.provaRecuperacao !== "Não fez",
    ).length;
    const recAprovados = students.filter(
      (s) => s.provaRecuperacao === "Fez – Aprovado",
    ).length;
    const fizDesafio = students.filter(
      (s) => s.desafioPresenca && s.desafioPresenca !== "Não fez",
    ).length;
    const desafioAprovados = students.filter(
      (s) => s.desafioPresenca === "Fez – Aprovado",
    ).length;

    const entregouFront = students.filter(
      (s) =>
        s.projetoFront === "Entregou – Aprovado" ||
        s.projetoFront === "Entregou – Reprovado",
    ).length;
    const aprovouFront = students.filter(
      (s) => s.projetoFront === "Entregou – Aprovado",
    ).length;
    const entregouBack = students.filter(
      (s) =>
        s.projetoBack === "Entregou – Aprovado" ||
        s.projetoBack === "Entregou – Reprovado",
    ).length;
    const aprovouBack = students.filter(
      (s) => s.projetoBack === "Entregou – Aprovado",
    ).length;
    const entregouFinal = students.filter(
      (s) =>
        s.projetoFinal === "Entregou – Aprovado" ||
        s.projetoFinal === "Entregou – Reprovado",
    ).length;
    const aprovouFinal = students.filter(
      (s) => s.projetoFinal === "Entregou – Aprovado",
    ).length;

    return {
      total,
      ativos: ativos.length,
      inativos: total - ativos.length,
      freqMedia,
      freqMediaAtivos,
      comMinimo: comMinimo.length,
      cem: cem.length,
      faixas,
      statusCounts,
      pct,
      progressoMedia,
      progressoFaixas,
      totalComProgresso: progressos.length,
      notas: {
        rec: avg(notasRec),
        front: avg(notasFront),
        back: avg(notasBack),
        final: avg(notasFinal),
      },
      recuperacao: { fez: fizRec, aprovados: recAprovados },
      desafio: { fez: fizDesafio, aprovados: desafioAprovados },
      projetos: {
        front: { entregou: entregouFront, aprovou: aprovouFront },
        back: { entregou: entregouBack, aprovou: aprovouBack },
        final: { entregou: entregouFinal, aprovou: aprovouFinal },
      },
    };
  }

  function gerarSugestoes(stats) {
    if (!stats) return [];
    const s = [];
    const {
      total,
      inativos,
      faixas,
      freqMedia,
      comMinimo,
      statusCounts,
      recuperacao,
    } = stats;

    if (inativos / total > 0.4)
      s.push(
        `⚠️ Alta taxa de ausência total (${pctFmt(inativos / total)}). Considerar estratégias de engajamento inicial nas próximas turmas, como contato ativo na primeira semana.`,
      );
    if (faixas["1-24"] / total > 0.1)
      s.push(
        `📉 ${faixas["1-24"]} alunos (${pctFmt(faixas["1-24"] / total)}) participaram apenas 1–24% das aulas — padrão típico de desistência precoce. Intervenção nas primeiras 3 aulas pode reduzir este índice.`,
      );
    if (freqMedia < 40)
      s.push(
        `📊 Frequência média geral abaixo de 40% (${freqMedia.toFixed(1)}%). Recomenda-se avaliar carga horária, horário das aulas e acessibilidade da plataforma.`,
      );
    if (comMinimo / total > 0.5)
      s.push(
        `✅ Mais de 50% dos inscritos atingiram o mínimo de 75% de presença — resultado expressivo. Boa prática a ser mantida.`,
      );
    if (recuperacao.fez > 0 && recuperacao.aprovados / recuperacao.fez < 0.5)
      s.push(
        `📝 Taxa de aprovação na prova de recuperação abaixo de 50% (${recuperacao.aprovados}/${recuperacao.fez}). Pode indicar necessidade de reforço antes da prova.`,
      );

    const aprovados = statusCounts["aprovado"] || 0;
    if (aprovados / total > 0.3)
      s.push(
        `🎓 ${aprovados} alunos (${pctFmt(aprovados / total)}) obtiveram Certificado de Conclusão — indicador positivo de entrega.`,
      );

    const repFalta = statusCounts["reprovado-falta"] || 0;
    if (repFalta > 0)
      s.push(
        `❌ ${repFalta} aluno(s) reprovados por falta. Reavaliação do critério de frequência mínima pode ser considerada se houver contexto socioeconômico relevante.`,
      );

    if (s.length === 0)
      s.push(
        `ℹ️ Dados insuficientes para sugestões automáticas. Preencha os campos de presença e desempenho para análise completa.`,
      );

    return s;
  }

  function pctFmt(n) {
    return (n * 100).toFixed(1) + "%";
  }
  function fmtNum(n, d = 1) {
    return n != null ? n.toFixed(d) : "—";
  }

  function barHtml(pct, color) {
    return `<div class="rpt-bar-wrap"><div class="rpt-bar" style="width:${Math.min(100, pct).toFixed(1)}%;background:${color}"></div></div>`;
  }

  const FAIXA_COLORS = {
    "100+": "#34d27c",
    "75-99": "#5ec98a",
    "50-74": "#f5c542",
    "25-49": "#f97316",
    "1-24": "#e85050",
    0: "#555d78",
  };

  // ── Seção de Progresso por formação ─────────────────────────────────────────
  function renderProgressoBlock(stats) {
    if (!stats || stats.totalComProgresso === 0) return "";
    const { progressoMedia, progressoFaixas, total } = stats;
    const PROG_COLORS = {
      "75-100": "#34d27c",
      "50-74": "#5ec98a",
      "25-49": "#f5c542",
      "1-24": "#f97316",
      0: "#555d78",
    };
    const rows = Object.entries({
      "75–100%": "75-100",
      "50–74%": "50-74",
      "25–49%": "25-49",
      "1–24%": "1-24",
      "Sem dado": "0",
    })
      .map(([label, key]) => {
        const n = progressoFaixas[key] || 0;
        const p = total > 0 ? (n / total) * 100 : 0;
        return `<tr>
        <td class="rpt-faixa-label">${label}</td>
        <td class="rpt-faixa-bar">${barHtml(p, PROG_COLORS[key])}</td>
        <td class="rpt-faixa-pct">${p.toFixed(1)}%</td>
        <td class="rpt-faixa-n">${n}</td></tr>`;
      })
      .join("");

    return `
    <div class="rpt-subsection">
      <h3 class="rpt-sub-title">Progresso no Curso</h3>
      <div class="rpt-highlight" style="margin-bottom:12px">
        <span class="rpt-highlight-pct">${fmtNum(progressoMedia)}%</span>
        <span class="rpt-highlight-text">progresso médio entre os ${stats.totalComProgresso} alunos com dado preenchido</span>
      </div>
      <table class="rpt-table">
        <thead><tr><th>Faixa</th><th>Distribuição</th><th>%</th><th>Alunos</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ── Seção Top 50 global (usada no Resumo Executivo) ──────────────────────────
  function renderTop50Block(allData) {
    // Monta lista de todos os alunos de todas as formações
    const todos = GT.FORMATIONS.flatMap((f) =>
      (allData[f.id] || []).map((s) => ({
        ...s,
        formacao: s.formacao || f.id,
      })),
    );
    if (todos.length === 0) return "";

    const rankMap = GT.calcRanking(todos);
    if (rankMap.size === 0) return "";

    // Conta medalhas por formação
    const contagem = {};
    GT.FORMATIONS.forEach((f) => {
      contagem[f.id] = { ouro: 0, prata: 0, bronze: 0, total: 0 };
    });
    rankMap.forEach((info, _id) => {
      const fid = todos.find((s) => s.id === _id)?.formacao;
      if (fid && contagem[fid]) {
        contagem[fid][info.medalha]++;
        contagem[fid].total++;
      }
    });

    const medalIcons = { ouro: "🥇", prata: "🥈", bronze: "🥉" };
    const rows = GT.FORMATIONS.map((f) => {
      const c = contagem[f.id];
      return `<tr>
        <td style="font-weight:600">${f.icon} ${f.label}</td>
        <td style="text-align:center">${c.ouro > 0 ? `🥇 ${c.ouro}` : "—"}</td>
        <td style="text-align:center">${c.prata > 0 ? `🥈 ${c.prata}` : "—"}</td>
        <td style="text-align:center">${c.bronze > 0 ? `🥉 ${c.bronze}` : "—"}</td>
        <td style="text-align:center;font-weight:700">${c.total}</td>
      </tr>`;
    }).join("");

    return `
    <div class="rpt-section rpt-top50-section">
      <h2 class="rpt-exec-title">🏆 Top 50 — Melhores Alunos</h2>
      <p style="font-size:13px;color:var(--text3);margin-bottom:16px">
        Distribuição proporcional entre as formações. Critérios: nota média → presença → progresso.
      </p>
      <table class="rpt-table">
        <thead>
          <tr>
            <th>Formação</th>
            <th style="text-align:center">🥇 Ouro (top 10)</th>
            <th style="text-align:center">🥈 Prata (11–25)</th>
            <th style="text-align:center">🥉 Bronze (26–50)</th>
            <th style="text-align:center">Total no Top 50</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border2)">
            <td>Total</td>
            <td style="text-align:center">10</td>
            <td style="text-align:center">15</td>
            <td style="text-align:center">25</td>
            <td style="text-align:center">50</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }

  function renderFormacao(formation, students, meta) {
    const stats = calcStats(students);
    const fMeta = meta[formation.id] || {};
    const sugs = gerarSugestoes(stats);

    if (!stats) {
      return `<section class="rpt-section">
        <div class="rpt-section-header">
          <div class="rpt-section-icon">${formation.icon}</div>
          <div><h2 class="rpt-section-title">${formation.label}</h2>
          <p class="rpt-section-meta">Nenhum dado disponível ainda</p></div>
        </div></section>`;
    }

    const periodo = fMeta.periodo || "—";
    const aulas = fMeta.aulas || "—";
    const status =
      fMeta.status === "em andamento"
        ? "Dados parciais (formação em andamento)"
        : "Dados totais (formação encerrada)";

    const faixasRows = Object.entries({
      "100%+": "100+",
      "75–99%": "75-99",
      "50–74%": "50-74",
      "25–49%": "25-49",
      "1–24%": "1-24",
      "0%": "0",
    })
      .map(([label, key]) => {
        const n = stats.faixas[key] || 0;
        const p = stats.total > 0 ? (n / stats.total) * 100 : 0;
        return `<tr>
        <td class="rpt-faixa-label">${label}</td>
        <td class="rpt-faixa-bar">${barHtml(p, FAIXA_COLORS[key])}</td>
        <td class="rpt-faixa-pct">${p.toFixed(1)}%</td>
        <td class="rpt-faixa-n">${n}</td></tr>`;
      })
      .join("");

    const statusLabels = {
      aprovado: { label: "Certificado de Conclusão", color: "#34d27c" },
      participacao: { label: "Certificado de Participação", color: "#f5c542" },
      vinculacao: { label: "Certificado de Vinculação", color: "#4a7df5" },
      "reprovado-falta": { label: "Reprovado por Falta", color: "#e85050" },
      vazio: { label: "Sem classificação", color: "#555d78" },
    };
    const statusRows = Object.entries(statusLabels)
      .map(([key, cfg]) => {
        const n = stats.statusCounts[key] || 0;
        if (n === 0) return "";
        const p = stats.pct(n);
        return `<tr>
        <td><span class="status-badge ${key}">${cfg.label}</span></td>
        <td class="rpt-faixa-bar">${barHtml(p, cfg.color)}</td>
        <td class="rpt-faixa-pct">${p.toFixed(1)}%</td>
        <td class="rpt-faixa-n">${n}</td></tr>`;
      })
      .filter(Boolean)
      .join("");

    const temNotas = Object.values(stats.notas).some((v) => v !== null);
    const notasBlock = temNotas
      ? `
      <div class="rpt-subsection">
        <h3 class="rpt-sub-title">Médias de Notas</h3>
        <div class="rpt-notas-grid">
          ${stats.notas.rec != null ? `<div class="rpt-nota-card"><div class="rpt-nota-val">${fmtNum(stats.notas.rec)}</div><div class="rpt-nota-label">Prova de Rec.</div></div>` : ""}
          ${stats.notas.front != null ? `<div class="rpt-nota-card"><div class="rpt-nota-val">${fmtNum(stats.notas.front)}</div><div class="rpt-nota-label">Proj. Front-end</div></div>` : ""}
          ${stats.notas.back != null ? `<div class="rpt-nota-card"><div class="rpt-nota-val">${fmtNum(stats.notas.back)}</div><div class="rpt-nota-label">Proj. Back-end</div></div>` : ""}
          ${stats.notas.final != null ? `<div class="rpt-nota-card"><div class="rpt-nota-val">${fmtNum(stats.notas.final)}</div><div class="rpt-nota-label">Proj. Final</div></div>` : ""}
        </div>
      </div>`
      : "";

    const temEntregas =
      stats.projetos.front.entregou > 0 ||
      stats.projetos.back.entregou > 0 ||
      stats.projetos.final.entregou > 0 ||
      stats.recuperacao.fez > 0;
    const entregasBlock = temEntregas
      ? `
      <div class="rpt-subsection">
        <h3 class="rpt-sub-title">Entregas e Avaliações</h3>
        <div class="rpt-entregas-grid">
          ${stats.recuperacao.fez > 0 ? `<div class="rpt-entrega-item"><span class="rpt-entrega-label">Prova de Recuperação</span><span class="rpt-entrega-vals">${stats.recuperacao.fez} fizeram · <strong>${stats.recuperacao.aprovados} aprovados</strong></span></div>` : ""}
          ${stats.desafio.fez > 0 ? `<div class="rpt-entrega-item"><span class="rpt-entrega-label">Desafio de Presença</span><span class="rpt-entrega-vals">${stats.desafio.fez} fizeram · <strong>${stats.desafio.aprovados} aprovados</strong></span></div>` : ""}
          ${stats.projetos.front.entregou > 0 ? `<div class="rpt-entrega-item"><span class="rpt-entrega-label">Projeto Front-end</span><span class="rpt-entrega-vals">${stats.projetos.front.entregou} entregaram · <strong>${stats.projetos.front.aprovou} aprovados</strong></span></div>` : ""}
          ${stats.projetos.back.entregou > 0 ? `<div class="rpt-entrega-item"><span class="rpt-entrega-label">Projeto Back-end</span><span class="rpt-entrega-vals">${stats.projetos.back.entregou} entregaram · <strong>${stats.projetos.back.aprovou} aprovados</strong></span></div>` : ""}
          ${stats.projetos.final.entregou > 0 ? `<div class="rpt-entrega-item"><span class="rpt-entrega-label">Projeto Final</span><span class="rpt-entrega-vals">${stats.projetos.final.entregou} entregaram · <strong>${stats.projetos.final.aprovou} aprovados</strong></span></div>` : ""}
        </div>
      </div>`
      : "";

    return `
    <section class="rpt-section">
      <div class="rpt-section-header">
        <div class="rpt-section-icon">${formation.icon}</div>
        <div>
          <h2 class="rpt-section-title">${formation.label}</h2>
          <p class="rpt-section-meta">Período: ${periodo} &nbsp;·&nbsp; ${aulas} aulas &nbsp;·&nbsp; ${status}</p>
        </div>
      </div>

      <div class="rpt-kpis">
        <div class="rpt-kpi"><div class="rpt-kpi-val">${stats.total}</div><div class="rpt-kpi-label">Inscritos</div><div class="rpt-kpi-sub">total de alunos</div></div>
        <div class="rpt-kpi"><div class="rpt-kpi-val">${stats.ativos}</div><div class="rpt-kpi-label">Participaram ao menos 1×</div><div class="rpt-kpi-sub">${pctFmt(stats.ativos / stats.total)} dos inscritos</div></div>
        <div class="rpt-kpi rpt-kpi-warn"><div class="rpt-kpi-val">${stats.inativos}</div><div class="rpt-kpi-label">Nunca compareceram</div><div class="rpt-kpi-sub">${pctFmt(stats.inativos / stats.total)} — zero presenças</div></div>
        <div class="rpt-kpi"><div class="rpt-kpi-val">${fmtNum(stats.freqMedia)}%</div><div class="rpt-kpi-label">Freq. média geral</div><div class="rpt-kpi-sub">todos os inscritos</div></div>
        <div class="rpt-kpi"><div class="rpt-kpi-val">${fmtNum(stats.freqMediaAtivos)}%</div><div class="rpt-kpi-label">Freq. média (ativos)</div><div class="rpt-kpi-sub">entre quem participou</div></div>
        <div class="rpt-kpi rpt-kpi-ok"><div class="rpt-kpi-val">${stats.comMinimo}</div><div class="rpt-kpi-label">Com ≥ 75% de presença</div><div class="rpt-kpi-sub">${pctFmt(stats.comMinimo / stats.total)} dos inscritos</div></div>
      </div>

      <div class="rpt-highlight">
        <span class="rpt-highlight-pct">${pctFmt(stats.comMinimo / stats.total)}</span>
        <span class="rpt-highlight-text">
          ${stats.comMinimo} alunos atingiram o mínimo de 75% de presença${fMeta.status === "em andamento" ? " (dados parciais)" : ""}.
          ${stats.cem > 0 ? ` Destes, ${stats.cem} alunos (${pctFmt(stats.cem / stats.total)}) alcançaram 100% de frequência.` : ""}
        </span>
      </div>

      <div class="rpt-subsection">
        <h3 class="rpt-sub-title">Distribuição por faixa de frequência</h3>
        <table class="rpt-table">
          <thead><tr><th>Faixa</th><th>Distribuição</th><th>%</th><th>Alunos</th></tr></thead>
          <tbody>${faixasRows}</tbody>
        </table>
      </div>

      <div class="rpt-subsection">
        <h3 class="rpt-sub-title">Situação Final dos Alunos</h3>
        <table class="rpt-table">
          <thead><tr><th>Status</th><th>Distribuição</th><th>%</th><th>Alunos</th></tr></thead>
          <tbody>${statusRows || '<tr><td colspan="4" style="color:var(--text3);text-align:center;padding:12px">Nenhum status calculado ainda</td></tr>'}</tbody>
        </table>
      </div>

      ${notasBlock}
      ${entregasBlock}
      ${renderProgressoBlock(stats)}

      <div class="rpt-subsection rpt-sugestoes">
        <h3 class="rpt-sub-title">Pontos de atenção e sugestões</h3>
        <ul class="rpt-sug-list">${sugs.map((s) => `<li class="rpt-sug-item">${s}</li>`).join("")}</ul>
      </div>
    </section>`;
  }

  async function renderReport() {
    const container = document.getElementById("reportContent");
    if (!container) return;
    container.innerHTML = `<div class="rpt-loading">⏳ Gerando relatório...</div>`;

    const meta = { ...DEFAULT_META, ...loadMeta() };
    const now = new Date();
    const dataStr = now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const horaStr = now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const allData = {};
    let totalInscritos = 0;
    for (const f of GT.FORMATIONS) {
      try {
        allData[f.id] = await GT.getStudents(f.id);
      } catch {
        allData[f.id] = [];
      }
      totalInscritos += allData[f.id].length;
    }

    const secoes = GT.FORMATIONS.map((f) =>
      renderFormacao(f, allData[f.id] || [], meta),
    ).join("");

    const top50Block = renderTop50Block(allData);

    container.innerHTML = `
      <div class="rpt-header">
        <div class="rpt-header-top">
          <div class="rpt-logo-mark">GT</div>
          <div class="rpt-header-text">
            <h1 class="rpt-main-title">${meta.titulo}</h1>
            <p class="rpt-main-sub">${meta.subtitulo}</p>
          </div>
          <div class="rpt-header-btns">
            <button class="rpt-edit-btn" id="btnExportRptHtml">📄 HTML</button>
            <button class="rpt-edit-btn" id="btnExportRptEditable">✏️ Editável</button>
            <button class="rpt-edit-btn" id="btnEditMeta">✏️ Editar</button>
          </div>
        </div>
        <div class="rpt-header-chips">
          <span class="rpt-chip">${GT.FORMATIONS.length} turmas</span>
          <span class="rpt-chip">${totalInscritos.toLocaleString("pt-BR")} inscrições</span>
          <span class="rpt-chip">gerado em ${dataStr} às ${horaStr}</span>
          <span class="rpt-chip">${meta.orgao}</span>
        </div>
      </div>

      <div class="rpt-exec-summary">
        <h2 class="rpt-exec-title">Resumo Executivo</h2>
        ${renderExecSummary(allData)}
      </div>

      ${top50Block}

      ${secoes}

      <div class="rpt-section rpt-obs-section">
        <h3 class="rpt-sub-title">Observações Gerais</h3>
        <div class="rpt-obs-text">${meta.observacoes || '<span style="color:var(--text3);font-style:italic">Clique em "Editar" para adicionar observações...</span>'}</div>
      </div>

      <div class="rpt-footer">
        ${meta.orgao} &nbsp;·&nbsp; Relatório gerado pelo Painel Administrativo Geração Tech &nbsp;·&nbsp; ${dataStr}
      </div>`;

    document
      .getElementById("btnEditMeta")
      ?.addEventListener("click", () => openMetaModal(meta));

    document.getElementById("btnPrintReport")?.addEventListener("click", () => {
      const content = document.getElementById("reportContent").innerHTML;
      const win = window.open("", "_blank");
      win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
          <meta charset="UTF-8">
          <title>${meta.titulo}</title>
          <style>
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box}
            body{font-family:Arial,sans-serif;background:#fff;color:#111;padding:24px;margin:0}
            h1,h2,h3{margin-bottom:8px}
            table{border-collapse:collapse;width:100%;margin-bottom:12px}
            th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}
            th{background:#e8eaf6}
            .rpt-bar-wrap{background:#eee;border-radius:4px;height:8px;overflow:hidden}
            .rpt-bar{height:8px;border-radius:4px}
            .rpt-header{background:#f4f6fb;border:1px solid #dde;border-radius:12px;padding:20px 24px 16px;margin-bottom:20px}
            .rpt-header-top{display:flex;align-items:center;gap:12px;margin-bottom:10px}
            .rpt-logo-mark{width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#2563eb,#7b4fff);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;flex-shrink:0}
            .rpt-main-title{font-size:18px;font-weight:800;color:#111}
            .rpt-main-sub{font-size:12px;color:#666;margin-top:2px}
            .rpt-header-chips{display:flex;flex-wrap:wrap;gap:6px}
            .rpt-chip{background:#eee;border:1px solid #ddd;border-radius:20px;padding:2px 9px;font-size:11px;color:#555}
            .rpt-exec-summary,.rpt-section{background:#f9f9fb;border:1px solid #dde;border-radius:10px;padding:18px 20px;margin-bottom:16px;page-break-inside:avoid}
            .rpt-exec-title,.rpt-section-title{font-size:15px;font-weight:700;margin-bottom:12px;color:#111}
            .rpt-exec-grid,.rpt-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
            .rpt-exec-card,.rpt-kpi{background:#fff;border:1px solid #dde;border-radius:8px;padding:12px 14px}
            .rpt-exec-val,.rpt-kpi-val{font-size:22px;font-weight:800;color:#2563eb}
            .rpt-exec-label,.rpt-kpi-label{font-size:12px;color:#444;font-weight:600;margin-top:2px}
            .rpt-exec-sub,.rpt-kpi-sub{font-size:11px;color:#888;margin-top:2px}
            .rpt-exec-ok .rpt-exec-val,.rpt-kpi-ok .rpt-kpi-val{color:#16a34a}
            .rpt-exec-green .rpt-exec-val{color:#16a34a}
            .rpt-kpi-warn .rpt-kpi-val{color:#dc2626}
            .rpt-highlight{background:#eff6ff;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:12px}
            .rpt-highlight-pct{font-size:28px;font-weight:800;color:#2563eb;flex-shrink:0}
            .rpt-highlight-text{font-size:13px;color:#444}
            .rpt-subsection{margin-bottom:16px}
            .rpt-sub-title{font-size:13px;font-weight:700;color:#333;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em}
            .rpt-faixa-label{font-size:12px;color:#555;width:80px}
            .rpt-faixa-pct{font-size:12px;color:#333;width:50px;text-align:right}
            .rpt-faixa-n{font-size:12px;font-weight:600;width:50px;text-align:right}
            .rpt-notas-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
            .rpt-nota-card{background:#fff;border:1px solid #dde;border-radius:8px;padding:10px;text-align:center}
            .rpt-nota-val{font-size:20px;font-weight:700;color:#2563eb}
            .rpt-nota-label{font-size:11px;color:#666;margin-top:2px}
            .rpt-entregas-grid{display:flex;flex-direction:column;gap:6px}
            .rpt-entrega-item{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #eee}
            .rpt-sug-list{padding-left:16px}
            .rpt-sug-item{font-size:12px;color:#444;margin-bottom:6px;line-height:1.5}
            .rpt-section-header{display:flex;align-items:center;gap:12px;margin-bottom:14px}
            .rpt-section-icon{width:36px;height:36px;border-radius:8px;background:#e8eaf6;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
            .rpt-section-meta{font-size:12px;color:#666;margin-top:2px}
            .rpt-footer{text-align:center;font-size:11px;color:#999;margin-top:24px;padding-top:12px;border-top:1px solid #eee}
            .status-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
            .status-badge.aprovado{background:#d1fae5;color:#065f46}
            .status-badge.participacao{background:#dbeafe;color:#1e3a8a}
            .status-badge.vinculacao{background:#ede9fe;color:#4c1d95}
            .status-badge.reprovado-falta{background:#fee2e2;color:#7f1d1d}
            .rpt-top50-section{background:#f9f9fb;border:1px solid #dde;border-radius:10px;padding:18px 20px;margin-bottom:16px}
            .rpt-header-btns,button{display:none!important}
          </style>
        </head><body>${content}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 800);
    });

    // ── Exportar HTML estático (colorido) ──────────────────────────────────
    document
      .getElementById("btnExportRptHtml")
      ?.addEventListener("click", () => {
        const content = document.getElementById("reportContent").innerHTML;
        const styles = [...document.styleSheets]
          .map((ss) => {
            try {
              return [...ss.cssRules].map((r) => r.cssText).join("\n");
            } catch {
              return "";
            }
          })
          .join("\n");
        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
        <title>${meta.titulo}</title>
        <style>
          body{font-family:Arial,sans-serif;background:#fff;color:#111;padding:24px}
          ${styles}
          :root{--bg1:#fff;--bg2:#f4f4f4;--bg3:#eee;--text1:#111;--text2:#333;--text3:#666;--border:#ccc;--border2:#bbb;--border3:#aaa;--accent:#2563eb}
        </style>
      </head><body>${content}</body></html>`;
        _download(html, `GeracaoTech_Relatorio.html`, "text/html");
        toast("Relatório HTML exportado!", "success");
      });

    // ── Exportar HTML editável ──────────────────────────────────────────────
    document
      .getElementById("btnExportRptEditable")
      ?.addEventListener("click", () => {
        const content = document.getElementById("reportContent").innerHTML;
        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
        <title>${meta.titulo} — Editável</title>
        <style>
          body{font-family:Arial,sans-serif;background:#fff;color:#111;padding:32px;max-width:900px;margin:0 auto}
          h1,h2,h3{margin-bottom:8px} table{border-collapse:collapse;width:100%}
          th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
          th{background:#e8eaf6} [contenteditable]{outline:2px dashed #2563eb;outline-offset:2px;border-radius:2px}
          .rpt-bar-wrap{background:#eee;border-radius:4px;height:8px;overflow:hidden}
          .rpt-bar{height:8px;border-radius:4px}
          .rpt-edit-btn,.rpt-header-btns{display:none}
        </style>
      </head><body>
        <p style="background:#fef9c3;border:1px solid #fde68a;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:20px">
          ✏️ <strong>Modo editável:</strong> Clique em qualquer texto para editar diretamente. Use Ctrl+P para imprimir ou salvar como PDF.
        </p>
        <div id="rpt-editable">${content}</div>
        <script>
          document.querySelectorAll('h1,h2,h3,p,td,li,.rpt-obs-text,.rpt-kpi-val,.rpt-highlight-pct').forEach(el => {
            el.setAttribute('contenteditable','true');
          });
          document.querySelectorAll('button').forEach(b => b.style.display='none');
        <\/script>
      </body></html>`;
        _download(html, `GeracaoTech_Relatorio_Editavel.html`, "text/html");
        toast("Relatório editável exportado!", "success");
      });
  }

  function _download(content, filename, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderExecSummary(allData) {
    let totalAlunos = 0,
      totalAtivos = 0,
      totalMinimo = 0,
      totalAprovados = 0;
    let totalComProgresso = 0,
      somaProgresso = 0;
    GT.FORMATIONS.forEach((f) => {
      const stats = calcStats(allData[f.id] || []);
      if (!stats) return;
      totalAlunos += stats.total;
      totalAtivos += stats.ativos;
      totalMinimo += stats.comMinimo;
      totalAprovados += stats.statusCounts["aprovado"] || 0;
      if (stats.progressoMedia != null) {
        somaProgresso += stats.progressoMedia * stats.totalComProgresso;
        totalComProgresso += stats.totalComProgresso;
      }
    });
    if (totalAlunos === 0)
      return `<p style="color:var(--text3)">Nenhum dado disponível.</p>`;

    const progressoGeralMedia =
      totalComProgresso > 0 ? somaProgresso / totalComProgresso : null;

    return `
    <div class="rpt-exec-grid">
      <div class="rpt-exec-card">
        <div class="rpt-exec-val">${totalAlunos.toLocaleString("pt-BR")}</div>
        <div class="rpt-exec-label">Total de inscritos</div>
      </div>
      <div class="rpt-exec-card">
        <div class="rpt-exec-val">${totalAtivos.toLocaleString("pt-BR")}</div>
        <div class="rpt-exec-label">Participaram ao menos 1×</div>
        <div class="rpt-exec-sub">${pctFmt(totalAtivos / totalAlunos)} dos inscritos</div>
      </div>
      <div class="rpt-exec-card rpt-exec-ok">
        <div class="rpt-exec-val">${totalMinimo.toLocaleString("pt-BR")}</div>
        <div class="rpt-exec-label">Com ≥ 75% de presença</div>
        <div class="rpt-exec-sub">${pctFmt(totalMinimo / totalAlunos)} dos inscritos</div>
      </div>
      <div class="rpt-exec-card rpt-exec-green">
        <div class="rpt-exec-val">${totalAprovados.toLocaleString("pt-BR")}</div>
        <div class="rpt-exec-label">Certificados de Conclusão</div>
        <div class="rpt-exec-sub">${pctFmt(totalAprovados / totalAlunos)} dos inscritos</div>
      </div>
      ${
        progressoGeralMedia != null
          ? `
      <div class="rpt-exec-card">
        <div class="rpt-exec-val">${fmtNum(progressoGeralMedia)}%</div>
        <div class="rpt-exec-label">Progresso médio geral</div>
        <div class="rpt-exec-sub">entre ${totalComProgresso.toLocaleString("pt-BR")} alunos com dado</div>
      </div>`
          : ""
      }
    </div>`;
  }

  function openMetaModal(currentMeta) {
    const existing = document.getElementById("metaModalOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "metaModalOverlay";

    const formacaoFields = GT.FORMATIONS.map(
      (f) => `
      <div class="rpt-meta-group">
        <div class="rpt-meta-group-title">${f.icon} ${f.label}</div>
        <div class="rpt-meta-row">
          <div class="modal-field">
            <label>Período</label>
            <input type="text" id="metaPeriodo_${f.id}" value="${currentMeta[f.id]?.periodo || ""}" placeholder="ex: 03/02 a 27/03" />
          </div>
          <div class="modal-field">
            <label>Nº de aulas</label>
            <input type="text" id="metaAulas_${f.id}" value="${currentMeta[f.id]?.aulas || ""}" placeholder="ex: 27" />
          </div>
          <div class="modal-field">
            <label>Status</label>
            <select id="metaStatus_${f.id}">
              <option value="encerrada"    ${(currentMeta[f.id]?.status || "encerrada") === "encerrada" ? "selected" : ""}>Encerrada</option>
              <option value="em andamento" ${(currentMeta[f.id]?.status || "") === "em andamento" ? "selected" : ""}>Em andamento</option>
            </select>
          </div>
        </div>
      </div>`,
    ).join("");

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:560px">
        <button class="modal-close" id="metaModalClose">✕</button>
        <div class="modal-header">
          <div class="modal-icon">✏️</div>
          <div class="modal-title-wrap">
            <div class="modal-title">Editar Relatório</div>
            <div class="modal-subtitle">Personalize cabeçalho, períodos e observações</div>
          </div>
        </div>
        <div class="modal-fields" style="gap:14px">
          <div class="modal-field"><label>Título do Relatório</label><input type="text" id="metaTitulo" value="${currentMeta.titulo || ""}" /></div>
          <div class="modal-field"><label>Subtítulo</label><input type="text" id="metaSubtitulo" value="${currentMeta.subtitulo || ""}" /></div>
          <div class="modal-field"><label>Órgão / Instituição</label><input type="text" id="metaOrgao" value="${currentMeta.orgao || ""}" /></div>
          <hr style="border:none;border-top:1px solid var(--border)" />
          ${formacaoFields}
          <hr style="border:none;border-top:1px solid var(--border)" />
          <div class="modal-field">
            <label>Observações Gerais</label>
            <textarea id="metaObs" rows="4" style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:9px 11px;font-family:var(--font);font-size:13px;color:var(--text1);outline:none;width:100%;resize:vertical">${currentMeta.observacoes || ""}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" id="metaModalCancel">Cancelar</button>
          <button class="btn-modal-apply" id="metaModalSave">💾 Salvar e Atualizar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("metaModalClose").onclick = close;
    document.getElementById("metaModalCancel").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById("metaModalSave").onclick = () => {
      const newMeta = {
        titulo: document.getElementById("metaTitulo").value,
        subtitulo: document.getElementById("metaSubtitulo").value,
        orgao: document.getElementById("metaOrgao").value,
        observacoes: document.getElementById("metaObs").value,
      };
      GT.FORMATIONS.forEach((f) => {
        newMeta[f.id] = {
          periodo: document.getElementById(`metaPeriodo_${f.id}`).value,
          aulas: document.getElementById(`metaAulas_${f.id}`).value,
          status: document.getElementById(`metaStatus_${f.id}`).value,
        };
      });
      saveMeta(newMeta);
      close();
      renderReport();
      toast("Relatório atualizado!", "success");
    };
  }

  window.Report = { render: renderReport };
})();

/**
 * dashboard.js — Painel Inicial do Administrador
 * Funcionalidades:
 *  - Dashboard com métricas gerais
 *  - Tutorial interativo de uso do sistema
 *  - Índice de ferramentas com acesso rápido
 *  - Auditoria de segurança
 */

(function () {
  "use strict";

  // ── Auditoria de Segurança ──────────────────────────────────────────────────
  const SECURITY_AUDIT = {
    items: [
      {
        status: "warn",
        titulo: "Credenciais em Base64 no código-fonte",
        descricao:
          "Email e senha estão em Base64 no auth.js. Base64 não é criptografia — qualquer pessoa com acesso ao JS pode decodificar.",
        recomendacao:
          "Mover autenticação para o Supabase Auth (email + senha com bcrypt). Remover credenciais hardcoded do frontend.",
      },
      {
        status: "warn",
        titulo: "Sessão armazenada em localStorage",
        descricao:
          "A sessão usa localStorage com hash simples. Vulnerável a XSS: um script malicioso pode roubar o token.",
        recomendacao:
          "Usar cookies httpOnly para sessão, ou adotar Supabase Auth que gerencia tokens com segurança.",
      },
      {
        status: "ok",
        titulo: "Proteção contra SQL Injection",
        descricao:
          "O sistema usa a API REST do Supabase com parâmetros URL — não concatena SQL diretamente. Risco baixo.",
        recomendacao:
          "Manter o padrão atual. Nunca construir queries SQL via concatenação de strings.",
      },
      {
        status: "ok",
        titulo: "Proteção contra XSS",
        descricao:
          "Os dados exibidos em tabela usam .textContent e createElement, não innerHTML com dados do usuário.",
        recomendacao:
          "Continuar evitando innerHTML com dados externos. Revisar templates HTML que interpolam dados do banco.",
      },
      {
        status: "ok",
        titulo: "Chave anon do Supabase exposta",
        descricao:
          "A anon key é pública por design no Supabase — é seguro expô-la. As RLS policies protegem os dados.",
        recomendacao:
          "Verificar se todas as tabelas têm RLS habilitado. Nunca expor a service_role key no frontend.",
      },
      {
        status: "info",
        titulo: "Sem controle de roles/permissões",
        descricao:
          "Existe apenas um nível de acesso (admin). Não há distinção entre leitura e escrita por usuário.",
        recomendacao:
          "Para múltiplos admins, implementar roles no Supabase Auth com políticas RLS diferenciadas.",
      },
      {
        status: "info",
        titulo: "Sem timeout de sessão",
        descricao:
          "A sessão não expira automaticamente. Uma vez logado, o acesso persiste indefinidamente.",
        recomendacao:
          "Adicionar verificação de timestamp na sessão e forçar relogin após N horas de inatividade.",
      },
      {
        status: "ok",
        titulo: "HTTPS em produção (Vercel/Netlify)",
        descricao:
          "Deploy em Vercel/Netlify garante HTTPS automático, protegendo dados em trânsito.",
        recomendacao: "Nunca hospedar em HTTP simples. Manter HTTPS ativo.",
      },
    ],
  };

  // ── Tutorial ────────────────────────────────────────────────────────────────
  const TUTORIAL_STEPS = [
    {
      icon: "👥",
      titulo: "Gerenciando Alunos",
      desc: "Selecione uma formação no menu lateral para ver a tabela de alunos. Use a busca para localizar alunos pelo nome. Clique em qualquer célula para editar diretamente.",
      dica: "Ative o Preenchimento Inteligente para editar múltiplos alunos de uma vez.",
    },
    {
      icon: "📥",
      titulo: "Importando Planilhas",
      desc: "Use Importar .xlsx para subir dados em lote. O sistema detecta automaticamente os cabeçalhos e mapeia os campos correspondentes.",
      dica: "Baixe o modelo de planilha na seção de Ferramentas para garantir o formato correto.",
    },
    {
      icon: "✨",
      titulo: "Preenchimento Inteligente",
      desc: "Ative o toggle no topo da tabela. Selecione alunos com os checkboxes e clique em um deles para preencher todos de uma vez. Use ← Anterior / Próximo → para navegar entre alunos.",
      dica: "Em formações presenciais, o modal mostra apenas os campos relevantes (sede, frequência, nota, progresso).",
    },
    {
      icon: "🏆",
      titulo: "Ranking Top 50",
      desc: "As colunas Medalha e Status Final são calculadas automaticamente com base nas notas. O ranking é proporcional ao tamanho de cada turma.",
      dica: "Use o dropdown de Medalha para sobrescrever manualmente em casos especiais.",
    },
    {
      icon: "📊",
      titulo: "Relatório Gerencial",
      desc: "Acesse Relatório no menu lateral. Clique em Atualizar para gerar dados em tempo real. Use Editar para personalizar título e períodos.",
      dica: "Exporte como HTML Editável para fazer ajustes antes de apresentar.",
    },
    {
      icon: "📤",
      titulo: "Exportando Dados",
      desc: "Use Exportar .xlsx para planilha padrão ou Exportar .html para versão colorida por status. O botão Top 50 exporta apenas os alunos premiados.",
      dica: "Filtre por status antes de exportar para obter listas específicas.",
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById("dashboardContent");
    if (!container) return;
    container.innerHTML = `<div class="rpt-loading">⏳ Carregando dashboard...</div>`;

    const dbStatus = document.getElementById("dash-db-status");
    const lastUpdate = document.getElementById("dash-last-update");
    if (dbStatus) {
      dbStatus.textContent =
        window.SB && SB.enabled() ? "Conectado ✓" : "Modo local (sem conexão)";
    }
    if (lastUpdate) {
      lastUpdate.textContent = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // Coleta métricas
    const metricas = {};
    let totalAlunos = 0;
    for (const f of GT.FORMATIONS) {
      try {
        const students = await GT.getStudents(f.id);
        metricas[f.id] = {
          label: f.label,
          icon: f.icon,
          total: students.length,
          students,
        };
        totalAlunos += students.length;
      } catch {
        metricas[f.id] = {
          label: f.label,
          icon: f.icon,
          total: 0,
          students: [],
        };
      }
    }

    // Conta aprovados total
    let totalAprovados = 0,
      totalParticipacao = 0,
      totalVinculacao = 0;
    Object.values(metricas).forEach(({ students }) => {
      students.forEach((s) => {
        const st = GT.calcStatus(s).key;
        if (st === "aprovado") totalAprovados++;
        else if (st === "participacao") totalParticipacao++;
        else if (st === "vinculacao") totalVinculacao++;
      });
    });

    // Conta medalhas
    const allStudents = Object.values(metricas).flatMap((m) => m.students);
    const rankMap = GT.calcRanking(allStudents);
    let totalOuro = 0,
      totalPrata = 0,
      totalBronze = 0;
    rankMap.forEach((info) => {
      if (info.medalha === "ouro") totalOuro++;
      else if (info.medalha === "prata") totalPrata++;
      else if (info.medalha === "bronze") totalBronze++;
    });

    const now = new Date();
    const dataStr = now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    container.innerHTML = `
    <div style="padding:0 0 40px">

      <!-- Header -->
      <div class="rpt-header" style="margin-bottom:24px">
        <div class="rpt-header-top">
          <div class="rpt-logo-mark">GT</div>
          <div class="rpt-header-text">
            <h1 class="rpt-main-title">Painel do Administrador</h1>
            <p class="rpt-main-sub">Geração Tech · IEL Ceará · ${dataStr}</p>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="rpt-exec-grid" style="margin-bottom:24px">
        <div class="rpt-exec-card">
          <div class="rpt-exec-val">${totalAlunos.toLocaleString("pt-BR")}</div>
          <div class="rpt-exec-label">Total de Alunos</div>
          <div class="rpt-exec-sub">${GT.FORMATIONS.length} formações ativas</div>
        </div>
        <div class="rpt-exec-card rpt-exec-green">
          <div class="rpt-exec-val">${totalAprovados.toLocaleString("pt-BR")}</div>
          <div class="rpt-exec-label">Certificados de Conclusão</div>
          <div class="rpt-exec-sub">${totalAlunos > 0 ? ((totalAprovados / totalAlunos) * 100).toFixed(1) : 0}% dos inscritos</div>
        </div>
        <div class="rpt-exec-card">
          <div class="rpt-exec-val">${totalParticipacao.toLocaleString("pt-BR")}</div>
          <div class="rpt-exec-label">Certificados de Participação</div>
          <div class="rpt-exec-sub">${totalAlunos > 0 ? ((totalParticipacao / totalAlunos) * 100).toFixed(1) : 0}% dos inscritos</div>
        </div>
        <div class="rpt-exec-card">
          <div class="rpt-exec-val" style="color:var(--accent)">🥇 ${totalOuro} · 🥈 ${totalPrata} · 🥉 ${totalBronze}</div>
          <div class="rpt-exec-label">Top 50 — Medalhas</div>
          <div class="rpt-exec-sub">${totalOuro + totalPrata + totalBronze} alunos premiados</div>
        </div>
      </div>

      <!-- Alunos por formação -->
      <div class="rpt-section" style="margin-bottom:24px">
        <h2 class="rpt-exec-title">📚 Alunos por Formação</h2>
        <div class="rpt-exec-grid">
          ${Object.values(metricas)
            .map(
              (m) => `
            <div class="rpt-exec-card" style="cursor:pointer" onclick="document.querySelector('[data-formation=\\'${GT.FORMATIONS.find((f) => f.label === m.label)?.id}\\']')?.click()">
              <div style="font-size:22px;margin-bottom:4px">${m.icon}</div>
              <div class="rpt-exec-val">${m.total}</div>
              <div class="rpt-exec-label">${m.label}</div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>

      <!-- Acesso rápido -->
      <div class="rpt-section" style="margin-bottom:24px">
        <h2 class="rpt-exec-title">⚡ Acesso Rápido</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:12px">
          ${[
            { icon: "📥", label: "Importar Planilha", id: "btnImport" },
            { icon: "📤", label: "Exportar Dados", id: "btnExport" },
            { icon: "➕", label: "Novo Aluno", id: "btnAddStudent" },
            { icon: "📊", label: "Relatório Gerencial", id: "btnReport" },
            { icon: "🏫", label: "Nova Turma", id: "btnNewFormation" },
            {
              icon: "🔒",
              label: "Auditoria de Segurança",
              id: "btnSecurityAudit",
            },
          ]
            .map(
              (t) => `
            <button onclick="document.getElementById('${t.id}')?.click()"
              style="background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:14px;cursor:pointer;font-family:var(--font);color:var(--text1);font-size:13px;font-weight:500;text-align:center;transition:background .15s;display:flex;flex-direction:column;align-items:center;gap:6px"
              onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='var(--bg2)'">
              <span style="font-size:22px">${t.icon}</span>
              ${t.label}
            </button>
          `,
            )
            .join("")}
        </div>
      </div>

      <!-- Tutorial -->
      <div class="rpt-section" style="margin-bottom:24px" id="tutorialSection">
        <h2 class="rpt-exec-title">📖 Guia de Uso do Sistema</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0" id="tutorialTabs">
          ${TUTORIAL_STEPS.map(
            (s, i) => `
            <button onclick="showTutorialStep(${i})" id="tutBtn${i}"
              style="background:${i === 0 ? "var(--accent)" : "var(--bg2)"};color:${i === 0 ? "#fff" : "var(--text2)"};border:1px solid var(--border2);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:500;font-family:var(--font);transition:all .15s">
              ${s.icon} ${s.titulo}
            </button>
          `,
          ).join("")}
        </div>
        <div id="tutorialContent" style="background:var(--bg2);border-radius:10px;padding:18px 20px;border:1px solid var(--border2)">
          ${renderTutorialStep(0)}
        </div>
      </div>

<!-- Status do Sistema -->
      <div class="rpt-section">
        <h2 class="rpt-exec-title">⚙️ Status do Sistema</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px">
          <div class="rpt-exec-card">
            <div style="font-size:22px;margin-bottom:6px">🟢</div>
            <div class="rpt-exec-label">Supabase</div>
            <div class="rpt-exec-sub" id="dash-db-status">Verificando...</div>
          </div>
          <div class="rpt-exec-card">
            <div style="font-size:22px;margin-bottom:6px">📅</div>
            <div class="rpt-exec-label">Última atualização</div>
            <div class="rpt-exec-sub" id="dash-last-update">—</div>
          </div>
          <div class="rpt-exec-card">
            <div style="font-size:22px;margin-bottom:6px">🌐</div>
            <div class="rpt-exec-label">Ambiente</div>
            <div class="rpt-exec-sub">${window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "Local (desenvolvimento)" : "Produção — " + window.location.hostname}</div>
          </div>
          <div class="rpt-exec-card">
            <div style="font-size:22px;margin-bottom:6px">📦</div>
            <div class="rpt-exec-label">Formações ativas</div>
            <div class="rpt-exec-sub">${GT.FORMATIONS.length} formações carregadas</div>
          </div>
        </div>
      </div>

    </div>`;

    // Wire theme toggle
    document
      .getElementById("themeToggleDashboard")
      ?.addEventListener("click", () => {
        const current =
          document.documentElement.getAttribute("data-theme") || "dark";
        document.documentElement.setAttribute(
          "data-theme",
          current === "dark" ? "light" : "dark",
        );
        localStorage.setItem("gt_theme", current === "dark" ? "light" : "dark");
      });
  }

  function renderTutorialStep(i) {
    const s = TUTORIAL_STEPS[i];
    return `
      <div style="display:flex;gap:16px;align-items:flex-start">
        <span style="font-size:36px;flex-shrink:0">${s.icon}</span>
        <div>
          <h3 style="font-size:15px;font-weight:700;color:var(--text1);margin-bottom:8px">${s.titulo}</h3>
          <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:10px">${s.desc}</p>
          <div style="background:rgba(55,104,219,0.08);border:1px solid rgba(55,104,219,0.2);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--accent)">
            💡 <strong>Dica:</strong> ${s.dica}
          </div>
        </div>
      </div>`;
  }

  window.showTutorialStep = function (i) {
    document.getElementById("tutorialContent").innerHTML =
      renderTutorialStep(i);
    document.querySelectorAll("[id^='tutBtn']").forEach((btn, idx) => {
      btn.style.background = idx === i ? "var(--accent)" : "var(--bg2)";
      btn.style.color = idx === i ? "#fff" : "var(--text2)";
    });
  };

  window.Dashboard = { render };
})();

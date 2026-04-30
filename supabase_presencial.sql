-- ================================================================
-- TABELAS PRESENCIAIS + TURMAS DINÂMICAS
-- Execute no Supabase SQL Editor
-- ================================================================

-- Presencial IA Generativa
CREATE TABLE IF NOT EXISTS public.alunos_presencial_ia_gen (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL DEFAULT '',
  formacao            TEXT NOT NULL DEFAULT 'presencial-ia-gen',
  sede                TEXT,
  presenca_final_plat NUMERIC(5,1) CHECK (presenca_final_plat IS NULL OR (presenca_final_plat >= 0 AND presenca_final_plat <= 100)),
  nota_projeto_final  NUMERIC(4,1) CHECK (nota_projeto_final IS NULL OR (nota_projeto_final >= 0 AND nota_projeto_final <= 10)),
  progresso_curso     NUMERIC(5,1) CHECK (progresso_curso IS NULL OR (progresso_curso >= 0 AND progresso_curso <= 100)),
  status_importado    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.alunos_presencial_ia_gen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_presencial_ia_gen" ON public.alunos_presencial_ia_gen FOR ALL USING (true) WITH CHECK (true);

-- Presencial IA + Soft Skills para Programadores
CREATE TABLE IF NOT EXISTS public.alunos_presencial_ia_soft (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL DEFAULT '',
  formacao            TEXT NOT NULL DEFAULT 'presencial-ia-soft',
  sede                TEXT,
  presenca_final_plat NUMERIC(5,1) CHECK (presenca_final_plat IS NULL OR (presenca_final_plat >= 0 AND presenca_final_plat <= 100)),
  nota_projeto_final  NUMERIC(4,1) CHECK (nota_projeto_final IS NULL OR (nota_projeto_final >= 0 AND nota_projeto_final <= 10)),
  progresso_curso     NUMERIC(5,1) CHECK (progresso_curso IS NULL OR (progresso_curso >= 0 AND progresso_curso <= 100)),
  status_importado    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.alunos_presencial_ia_soft ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_presencial_ia_soft" ON public.alunos_presencial_ia_soft FOR ALL USING (true) WITH CHECK (true);

-- Turmas dinâmicas (metadados)
CREATE TABLE IF NOT EXISTS public.turmas_customizadas (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📚',
  color       TEXT NOT NULL DEFAULT '#6366f1',
  table_name  TEXT NOT NULL UNIQUE,
  tipo        TEXT NOT NULL DEFAULT 'presencial',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.turmas_customizadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_turmas" ON public.turmas_customizadas FOR ALL USING (true) WITH CHECK (true);

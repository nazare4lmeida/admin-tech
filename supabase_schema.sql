-- ============================================================
-- GeracaoTech Admin — Supabase Schema
-- ============================================================
-- HOW TO USE:
-- 1. Open your Supabase project → SQL Editor
-- 2. Paste this entire file and click Run
-- 3. All 3 tables will be created and secured
-- ============================================================

-- Enable UUID extension (already enabled on most Supabase projects)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: alunos_fullstack
-- Fullstack has Front-end + Back-end + Final projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alunos_fullstack (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome                 TEXT        NOT NULL,
  formacao             TEXT        NOT NULL DEFAULT 'fullstack',

  -- Recovery exam
  prova_recuperacao    TEXT        CHECK (prova_recuperacao IN ('', 'Não fez', 'Fez – Aprovado', 'Fez – Reprovado') OR prova_recuperacao IS NULL),
  nota_prova_rec       NUMERIC(4,1) CHECK (nota_prova_rec IS NULL OR (nota_prova_rec >= 0 AND nota_prova_rec <= 10)),

  -- Attendance challenge
  desafio_presenca     TEXT        CHECK (desafio_presenca IN ('', 'Não fez', 'Fez – Aprovado', 'Fez – Reprovado') OR desafio_presenca IS NULL),
  pct_desafio_presenca NUMERIC(5,1) CHECK (pct_desafio_presenca IS NULL OR (pct_desafio_presenca >= 0 AND pct_desafio_presenca <= 100)),

  -- Attendance
  presenca_final_plat  NUMERIC(5,1) CHECK (presenca_final_plat IS NULL OR (presenca_final_plat >= 0 AND presenca_final_plat <= 100)),
  reprovado_falta      TEXT        CHECK (reprovado_falta IN ('', 'Sim', 'Não') OR reprovado_falta IS NULL),

  -- Fullstack-specific projects
  projeto_front        TEXT        CHECK (projeto_front IN ('', 'Não entregou', 'Entregou – Aprovado', 'Entregou – Reprovado') OR projeto_front IS NULL),
  nota_front           NUMERIC(4,1) CHECK (nota_front IS NULL OR (nota_front >= 0 AND nota_front <= 10)),
  projeto_back         TEXT        CHECK (projeto_back IN ('', 'Não entregou', 'Entregou – Aprovado', 'Entregou – Reprovado') OR projeto_back IS NULL),
  nota_back            NUMERIC(4,1) CHECK (nota_back IS NULL OR (nota_back >= 0 AND nota_back <= 10)),

  -- Final project
  projeto_final        TEXT        CHECK (projeto_final IN ('', 'Não entregou', 'Entregou – Aprovado', 'Entregou – Reprovado') OR projeto_final IS NULL),
  nota_projeto_final   NUMERIC(4,1) CHECK (nota_projeto_final IS NULL OR (nota_projeto_final >= 0 AND nota_projeto_final <= 10)),

  -- Course progress
  progresso_curso      NUMERIC(5,1) CHECK (progresso_curso IS NULL OR (progresso_curso >= 0 AND progresso_curso <= 100)),

  -- Imported status (raw, from spreadsheet)
  status_importado     TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: alunos_ia_generativa
-- IA Generativa has only Final project (no Front/Back)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alunos_ia_generativa (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome                 TEXT        NOT NULL,
  formacao             TEXT        NOT NULL DEFAULT 'ia-generativa',

  -- Recovery exam
  prova_recuperacao    TEXT        CHECK (prova_recuperacao IN ('', 'Não fez', 'Fez – Aprovado', 'Fez – Reprovado') OR prova_recuperacao IS NULL),
  nota_prova_rec       NUMERIC(4,1) CHECK (nota_prova_rec IS NULL OR (nota_prova_rec >= 0 AND nota_prova_rec <= 10)),

  -- Attendance challenge
  desafio_presenca     TEXT        CHECK (desafio_presenca IN ('', 'Não fez', 'Fez – Aprovado', 'Fez – Reprovado') OR desafio_presenca IS NULL),
  pct_desafio_presenca NUMERIC(5,1) CHECK (pct_desafio_presenca IS NULL OR (pct_desafio_presenca >= 0 AND pct_desafio_presenca <= 100)),

  -- Attendance
  presenca_final_plat  NUMERIC(5,1) CHECK (presenca_final_plat IS NULL OR (presenca_final_plat >= 0 AND presenca_final_plat <= 100)),
  reprovado_falta      TEXT        CHECK (reprovado_falta IN ('', 'Sim', 'Não') OR reprovado_falta IS NULL),

  -- Final project only (no front/back)
  projeto_final        TEXT        CHECK (projeto_final IN ('', 'Não entregou', 'Entregou – Aprovado', 'Entregou – Reprovado') OR projeto_final IS NULL),
  nota_projeto_final   NUMERIC(4,1) CHECK (nota_projeto_final IS NULL OR (nota_projeto_final >= 0 AND nota_projeto_final <= 10)),

  -- Imported status
  status_importado     TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: alunos_ia_soft_skills
-- IA + Soft Skills has only Final project (no Front/Back)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alunos_ia_soft_skills (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome                 TEXT        NOT NULL,
  formacao             TEXT        NOT NULL DEFAULT 'ia-soft-skills',

  -- Recovery exam
  prova_recuperacao    TEXT        CHECK (prova_recuperacao IN ('', 'Não fez', 'Fez – Aprovado', 'Fez – Reprovado') OR prova_recuperacao IS NULL),
  nota_prova_rec       NUMERIC(4,1) CHECK (nota_prova_rec IS NULL OR (nota_prova_rec >= 0 AND nota_prova_rec <= 10)),

  -- Attendance challenge
  desafio_presenca     TEXT        CHECK (desafio_presenca IN ('', 'Não fez', 'Fez – Aprovado', 'Fez – Reprovado') OR desafio_presenca IS NULL),
  pct_desafio_presenca NUMERIC(5,1) CHECK (pct_desafio_presenca IS NULL OR (pct_desafio_presenca >= 0 AND pct_desafio_presenca <= 100)),

  -- Attendance
  presenca_final_plat  NUMERIC(5,1) CHECK (presenca_final_plat IS NULL OR (presenca_final_plat >= 0 AND presenca_final_plat <= 100)),
  reprovado_falta      TEXT        CHECK (reprovado_falta IN ('', 'Sim', 'Não') OR reprovado_falta IS NULL),

  -- Final project only
  projeto_final        TEXT        CHECK (projeto_final IN ('', 'Não entregou', 'Entregou – Aprovado', 'Entregou – Reprovado') OR projeto_final IS NULL),
  nota_projeto_final   NUMERIC(4,1) CHECK (nota_projeto_final IS NULL OR (nota_projeto_final >= 0 AND nota_projeto_final <= 10)),

  -- Imported status
  status_importado     TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUTO-UPDATE updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all 3 tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fullstack_updated_at') THEN
    CREATE TRIGGER trg_fullstack_updated_at
      BEFORE UPDATE ON public.alunos_fullstack
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ia_gen_updated_at') THEN
    CREATE TRIGGER trg_ia_gen_updated_at
      BEFORE UPDATE ON public.alunos_ia_generativa
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ia_ss_updated_at') THEN
    CREATE TRIGGER trg_ia_ss_updated_at
      BEFORE UPDATE ON public.alunos_ia_soft_skills
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Using anon key = read/write access for the admin app.
-- The app is protected by its own login screen.
-- ============================================================
ALTER TABLE public.alunos_fullstack      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos_ia_generativa  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos_ia_soft_skills ENABLE ROW LEVEL SECURITY;

-- Allow full access via anon key (the app handles auth itself)
CREATE POLICY "anon_all_fullstack"
  ON public.alunos_fullstack FOR ALL
  TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_ia_generativa"
  ON public.alunos_ia_generativa FOR ALL
  TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_ia_soft_skills"
  ON public.alunos_ia_soft_skills FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- INDEXES for faster name searches
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_fullstack_nome      ON public.alunos_fullstack      (nome);
CREATE INDEX IF NOT EXISTS idx_ia_gen_nome         ON public.alunos_ia_generativa  (nome);
CREATE INDEX IF NOT EXISTS idx_ia_ss_nome          ON public.alunos_ia_soft_skills (nome);

-- ============================================================
-- Done! 3 tables created:
--   public.alunos_fullstack      (Front + Back + Final)
--   public.alunos_ia_generativa  (Final only)
--   public.alunos_ia_soft_skills (Final only)
-- ============================================================

-- ============================================================
-- MIGRATION: Add progresso_curso column (run if tables already exist)
-- ============================================================
ALTER TABLE public.alunos_fullstack      ADD COLUMN IF NOT EXISTS progresso_curso NUMERIC(5,1) CHECK (progresso_curso IS NULL OR (progresso_curso >= 0 AND progresso_curso <= 100));
ALTER TABLE public.alunos_ia_generativa  ADD COLUMN IF NOT EXISTS progresso_curso NUMERIC(5,1) CHECK (progresso_curso IS NULL OR (progresso_curso >= 0 AND progresso_curso <= 100));
ALTER TABLE public.alunos_ia_soft_skills ADD COLUMN IF NOT EXISTS progresso_curso NUMERIC(5,1) CHECK (progresso_curso IS NULL OR (progresso_curso >= 0 AND progresso_curso <= 100));

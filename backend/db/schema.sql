-- =============================================================================
-- CPROI Database Schema
-- Supabase (PostgreSQL 15+)
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- TABLE: roi_cases (top-level entity)
-- -----------------------------------------------------------------------------

CREATE TABLE roi_cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL DEFAULT auth.uid(),
    company_name    TEXT NOT NULL,
    industry        TEXT NOT NULL,
    service_type    TEXT NOT NULL DEFAULT 'experience-transformation-design',
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('generating', 'draft', 'reviewed', 'exported')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roi_cases_user ON roi_cases(user_id);
CREATE INDEX idx_roi_cases_company ON roi_cases(company_name);
CREATE INDEX idx_roi_cases_created ON roi_cases(created_at DESC);

-- RLS
ALTER TABLE roi_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cases"
    ON roi_cases FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cases"
    ON roi_cases FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cases"
    ON roi_cases FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cases"
    ON roi_cases FOR DELETE
    USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- TABLE: data_sources (raw source provenance)
-- -----------------------------------------------------------------------------

CREATE TABLE data_sources (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES roi_cases(id) ON DELETE CASCADE,
    source_type         TEXT NOT NULL,
    source_url          TEXT,
    source_label        TEXT NOT NULL DEFAULT '',
    retrieval_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_value           JSONB,
    relevance_score     NUMERIC(4,3) CHECK (relevance_score >= 0 AND relevance_score <= 1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_sources_case ON data_sources(case_id);

-- RLS
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data_sources"
    ON data_sources FOR SELECT
    USING (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own data_sources"
    ON data_sources FOR INSERT
    WITH CHECK (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));


-- -----------------------------------------------------------------------------
-- TABLE: data_points (individual values with confidence metadata)
-- -----------------------------------------------------------------------------

CREATE TABLE data_points (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES roi_cases(id) ON DELETE CASCADE,
    field_name          TEXT NOT NULL,
    value               NUMERIC NOT NULL,
    confidence_tier     TEXT NOT NULL
                        CHECK (confidence_tier IN ('company_reported', 'industry_benchmark', 'cross_industry', 'estimated')),
    confidence_score    NUMERIC(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    source_id           UUID REFERENCES data_sources(id) ON DELETE SET NULL,
    is_override         BOOLEAN NOT NULL DEFAULT false,
    override_reason     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_points_case ON data_points(case_id);
CREATE INDEX idx_data_points_source ON data_points(source_id);
CREATE INDEX idx_data_points_field ON data_points(case_id, field_name);

-- RLS
ALTER TABLE data_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data_points"
    ON data_points FOR SELECT
    USING (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own data_points"
    ON data_points FOR INSERT
    WITH CHECK (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));


-- -----------------------------------------------------------------------------
-- TABLE: calculations (per-KPI results per scenario)
-- -----------------------------------------------------------------------------

CREATE TABLE calculations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES roi_cases(id) ON DELETE CASCADE,
    scenario            TEXT NOT NULL
                        CHECK (scenario IN ('conservative', 'moderate', 'aggressive')),
    kpi_id              TEXT NOT NULL,
    raw_impact          NUMERIC NOT NULL,
    adjusted_impact     NUMERIC NOT NULL,
    confidence_discount NUMERIC(4,3) NOT NULL,
    benchmark_value     NUMERIC NOT NULL,
    weight              NUMERIC(4,3) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calculations_case ON calculations(case_id);
CREATE INDEX idx_calculations_scenario ON calculations(case_id, scenario);

-- RLS
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own calculations"
    ON calculations FOR SELECT
    USING (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own calculations"
    ON calculations FOR INSERT
    WITH CHECK (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));


-- -----------------------------------------------------------------------------
-- TABLE: narratives (generated SCR text per scenario)
-- -----------------------------------------------------------------------------

CREATE TABLE narratives (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES roi_cases(id) ON DELETE CASCADE,
    scenario            TEXT NOT NULL
                        CHECK (scenario IN ('conservative', 'moderate', 'aggressive')),
    narrative_text      TEXT NOT NULL,
    headline            TEXT,
    framing_type        TEXT NOT NULL DEFAULT 'revenue_at_risk'
                        CHECK (framing_type IN ('revenue_at_risk', 'revenue_opportunity')),
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_narratives_case ON narratives(case_id);
CREATE INDEX idx_narratives_scenario ON narratives(case_id, scenario);

-- RLS
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own narratives"
    ON narratives FOR SELECT
    USING (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own narratives"
    ON narratives FOR INSERT
    WITH CHECK (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));


-- -----------------------------------------------------------------------------
-- TABLE: overrides (tracking manual data overrides)
-- -----------------------------------------------------------------------------

CREATE TABLE overrides (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES roi_cases(id) ON DELETE CASCADE,
    data_point_id       UUID NOT NULL REFERENCES data_points(id) ON DELETE CASCADE,
    original_value      NUMERIC NOT NULL,
    override_value      NUMERIC NOT NULL,
    reason              TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_overrides_case ON overrides(case_id);
CREATE INDEX idx_overrides_data_point ON overrides(data_point_id);

-- RLS
ALTER TABLE overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own overrides"
    ON overrides FOR SELECT
    USING (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own overrides"
    ON overrides FOR INSERT
    WITH CHECK (case_id IN (SELECT id FROM roi_cases WHERE user_id = auth.uid()));


-- -----------------------------------------------------------------------------
-- Auto-update updated_at trigger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER roi_cases_updated_at
    BEFORE UPDATE ON roi_cases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

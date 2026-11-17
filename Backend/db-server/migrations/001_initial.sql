PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    linkedin_sub TEXT NOT NULL UNIQUE,
    name TEXT,
    given_name TEXT,
    family_name TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    analysis_result TEXT NOT NULL,
    completeness REAL NOT NULL CHECK (completeness >= 0 AND completeness <= 100),
    content_quality REAL NOT NULL CHECK (content_quality >= 0 AND content_quality <= 100),
    keyword_and_role_relevance REAL NOT NULL CHECK (keyword_and_role_relevance >= 0 AND keyword_and_role_relevance <= 100),
    career_trajectory REAL NOT NULL CHECK (career_trajectory >= 0 AND career_trajectory <= 100),
    skills_depth REAL NOT NULL CHECK (skills_depth >= 0 AND skills_depth <= 100),
    social_proof REAL NOT NULL CHECK (social_proof >= 0 AND social_proof <= 100),
    network REAL NOT NULL CHECK (network >= 0 AND network <= 100),
    activity REAL NOT NULL CHECK (activity >= 0 AND activity <= 100),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_created
    ON analyses(user_id, created_at DESC);

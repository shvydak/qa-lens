PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repositories (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  local_path                TEXT NOT NULL,
  github_url                TEXT,
  github_token              TEXT,
  github_credential_id      TEXT REFERENCES github_credentials(id) ON DELETE SET NULL,
  source_type               TEXT NOT NULL DEFAULT 'local_path' CHECK(source_type IN ('local_path','managed_clone')),
  branch                    TEXT NOT NULL DEFAULT 'main',
  last_fetched_at           TEXT,
  last_analyzed_commit_hash TEXT,
  UNIQUE(project_id, local_path)
);

CREATE TABLE IF NOT EXISTS github_credentials (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS repository_branches (
  id                        TEXT PRIMARY KEY,
  repository_id             TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','missing','archived')),
  is_active                 INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  last_fetched_at           TEXT,
  last_analyzed_commit_hash TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(repository_id, name)
);

CREATE TABLE IF NOT EXISTS test_sets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  analysis_context_id TEXT REFERENCES analysis_contexts(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','passed','failed')),
  commit_ranges TEXT NOT NULL DEFAULT '{}',
  ai_summary    TEXT,
  regressions   TEXT,
  cross_impacts TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS analysis_contexts (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  branch_signature TEXT NOT NULL,
  branch_ids       TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, branch_signature)
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id            TEXT PRIMARY KEY,
  test_set_id   TEXT NOT NULL REFERENCES test_sets(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  commit_ranges TEXT NOT NULL DEFAULT '{}',
  ai_summary    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tests (
  id          TEXT PRIMARY KEY,
  test_set_id TEXT NOT NULL REFERENCES test_sets(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  title       TEXT,
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  area        TEXT,
  user_scenario    TEXT,
  preconditions    TEXT,
  steps            TEXT,
  expected_result  TEXT,
  risk             TEXT,
  technical_context TEXT,
  analysis_run_id TEXT REFERENCES analysis_runs(id) ON DELETE SET NULL,
  repository_branch_id TEXT REFERENCES repository_branches(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'not_tested' CHECK(status IN ('not_tested','pass','fail','skip')),
  source      TEXT NOT NULL DEFAULT 'ai' CHECK(source IN ('ai','manual')),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_repos_project ON repositories(project_id);
CREATE INDEX IF NOT EXISTS idx_credentials_project ON github_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_repo_branches_repo ON repository_branches(repository_id);
CREATE INDEX IF NOT EXISTS idx_repo_branches_active ON repository_branches(repository_id, is_active);
CREATE INDEX IF NOT EXISTS idx_test_sets_project ON test_sets(project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_test_set ON analysis_runs(test_set_id);
CREATE INDEX IF NOT EXISTS idx_tests_test_set ON tests(test_set_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(test_set_id, status);

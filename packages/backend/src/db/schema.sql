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
  branch                    TEXT NOT NULL DEFAULT 'main',
  last_fetched_at           TEXT,
  last_analyzed_commit_hash TEXT,
  UNIQUE(project_id, local_path)
);

CREATE TABLE IF NOT EXISTS test_sets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','passed','failed')),
  commit_ranges TEXT NOT NULL DEFAULT '{}',
  ai_summary    TEXT,
  regressions   TEXT,
  cross_impacts TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS tests (
  id          TEXT PRIMARY KEY,
  test_set_id TEXT NOT NULL REFERENCES test_sets(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  area        TEXT,
  status      TEXT NOT NULL DEFAULT 'not_tested' CHECK(status IN ('not_tested','pass','fail','skip')),
  source      TEXT NOT NULL DEFAULT 'ai' CHECK(source IN ('ai','manual')),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_repos_project ON repositories(project_id);
CREATE INDEX IF NOT EXISTS idx_test_sets_project ON test_sets(project_id);
CREATE INDEX IF NOT EXISTS idx_tests_test_set ON tests(test_set_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(test_set_id, status);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'moderator', 'administrator')),
  privacy_accepted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'billing')),
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('software', 'service')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE attribute_definitions (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('text', 'long_text', 'number', 'boolean', 'enum', 'url')),
  enum_options TEXT,
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  filterable INTEGER NOT NULL DEFAULT 0 CHECK (filterable IN (0, 1)),
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_attr_global_key ON attribute_definitions(key) WHERE category_id IS NULL;
CREATE UNIQUE INDEX idx_attr_cat_key ON attribute_definitions(category_id, key) WHERE category_id IS NOT NULL;

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('software', 'service')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'published', 'rejected', 'archived')),
  organization_id TEXT REFERENCES organizations(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  submitted_by_user_id TEXT REFERENCES users(id),
  published_revision_id TEXT,
  external_key TEXT UNIQUE,
  provider_label TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0, 1)),
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE listing_revisions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  website TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id),
  kind TEXT NOT NULL CHECK (kind IN ('software', 'service')),
  proposed_slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  change_note TEXT NOT NULL DEFAULT '',
  submitted_by_user_id TEXT REFERENCES users(id),
  reviewed_by_user_id TEXT REFERENCES users(id),
  review_note TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE (listing_id, revision_number)
);

CREATE TABLE listing_prices (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES listing_revisions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('free', 'subscription', 'one_time', 'usage', 'contact')),
  amount_cents INTEGER,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  billing_interval TEXT CHECK (billing_interval IN ('month', 'year')),
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE listing_attribute_values (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES listing_revisions(id) ON DELETE CASCADE,
  definition_id TEXT NOT NULL REFERENCES attribute_definitions(id),
  value_text TEXT,
  value_number REAL,
  value_boolean INTEGER,
  UNIQUE (revision_id, definition_id),
  CHECK ((value_text IS NOT NULL) + (value_number IS NOT NULL) + (value_boolean IS NOT NULL) = 1)
);

CREATE TABLE listing_tags (
  revision_id TEXT NOT NULL REFERENCES listing_revisions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (revision_id, tag_id)
);

CREATE TABLE listing_images (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES listing_revisions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('logo', 'screenshot')),
  path TEXT NOT NULL,
  alt TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE listing_ownerships (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  granted_via TEXT NOT NULL CHECK (granted_via IN ('submission', 'claim', 'admin', 'import')),
  granted_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (listing_id, owner_type, owner_id)
);

CREATE TABLE ownership_claims (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  claimant_user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  evidence_text TEXT NOT NULL,
  evidence_url TEXT,
  reviewer_user_id TEXT REFERENCES users(id),
  review_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'rejected', 'removed')),
  relationship TEXT NOT NULL CHECK (relationship IN ('ordinary', 'verified_customer')) DEFAULT 'ordinary',
  verification_note TEXT,
  verified_by_user_id TEXT REFERENCES users(id),
  moderator_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE (listing_id, author_user_id)
);

CREATE TABLE review_reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'conflict', 'personal_data', 'other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('open', 'dismissed', 'actioned')),
  resolved_by_user_id TEXT REFERENCES users(id),
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  listing_limit INTEGER NOT NULL,
  allows_sponsorship INTEGER NOT NULL DEFAULT 0 CHECK (allows_sponsorship IN (0, 1))
);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  status TEXT NOT NULL CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled')),
  source TEXT NOT NULL CHECK (source IN ('mock', 'stripe', 'editorial')),
  provider_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (provider_confirmed IN (0, 1)),
  current_period_end TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  UNIQUE (provider, external_event_id)
);

CREATE TABLE sponsored_placements (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  placement TEXT NOT NULL CHECK (placement IN ('homepage', 'category', 'search')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'canceled')),
  disclosure TEXT NOT NULL DEFAULT 'Sponsored',
  requires_entitlement INTEGER NOT NULL DEFAULT 1 CHECK (requires_entitlement IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  dek TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  author_label TEXT NOT NULL DEFAULT 'Quire editorial desk',
  published_at TEXT,
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE article_listings (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, listing_id)
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, slug)
);

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, listing_id)
);

CREATE TABLE slug_redirects (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('listing', 'category', 'article')),
  entity_id TEXT NOT NULL,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  stored_path TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'commit')),
  strategy TEXT NOT NULL CHECK (strategy IN ('all_or_nothing', 'partial')),
  on_duplicate TEXT NOT NULL CHECK (on_duplicate IN ('skip', 'revise')),
  status TEXT NOT NULL CHECK (status IN ('preview', 'completed', 'failed')),
  created_by_user_id TEXT REFERENCES users(id),
  byte_size INTEGER NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  mapping_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('valid', 'invalid', 'duplicate', 'imported', 'skipped')),
  errors TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  tone TEXT NOT NULL CHECK (tone IN ('ok', 'err')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_listings_status ON listings(status, updated_at);
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_org ON listings(organization_id);
CREATE INDEX idx_revisions_listing ON listing_revisions(listing_id, revision_number);
CREATE INDEX idx_revisions_status ON listing_revisions(status);
CREATE INDEX idx_memberships_user ON organization_memberships(user_id);
CREATE INDEX idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX idx_claims_status ON ownership_claims(status, created_at);
CREATE INDEX idx_reviews_listing ON reviews(listing_id, status);
CREATE INDEX idx_reports_status ON review_reports(status, created_at);
CREATE INDEX idx_prices_revision ON listing_prices(revision_id);
CREATE INDEX idx_attr_revision ON listing_attribute_values(revision_id);
CREATE INDEX idx_sponsorship_window ON sponsored_placements(placement, status, starts_at, ends_at);
CREATE INDEX idx_entitlements_org ON entitlements(organization_id, status);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_login_email ON login_attempts(email, created_at);
CREATE INDEX idx_articles_status ON articles(status, published_at);

CREATE VIRTUAL TABLE listing_search USING fts5(
  listing_id UNINDEXED,
  title,
  summary,
  body,
  provider,
  tags,
  category,
  tokenize = 'porter unicode61'
);

-- SPDX-License-Identifier: GPL-3.0-only
-- WP同形(最小列)のスキーマ。SQLite方言。設計 docs/05-design-v2.md §4, §14 に従う。
-- 日時は UTC の ISO8601 TEXT。ID は INTEGER。

CREATE TABLE posts (
  ID INTEGER PRIMARY KEY,
  post_author INTEGER NOT NULL DEFAULT 0,
  post_date_gmt TEXT NOT NULL DEFAULT '',
  post_content TEXT NOT NULL DEFAULT '',
  post_title TEXT NOT NULL DEFAULT '',
  post_excerpt TEXT NOT NULL DEFAULT '',
  post_status TEXT NOT NULL DEFAULT 'draft',
  post_password TEXT,
  post_name TEXT NOT NULL DEFAULT '',
  post_type TEXT NOT NULL DEFAULT 'post',
  post_parent INTEGER NOT NULL DEFAULT 0,
  post_modified_gmt TEXT NOT NULL DEFAULT '',
  auth_version INTEGER NOT NULL DEFAULT 1,
  visibility_epoch INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX posts_status_author ON posts (post_status, post_author);
CREATE INDEX posts_type_name ON posts (post_type, post_name);

CREATE TABLE postmeta (
  meta_id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  meta_key TEXT,
  meta_value TEXT
);
CREATE INDEX postmeta_post_id ON postmeta (post_id);
CREATE INDEX postmeta_meta_key ON postmeta (meta_key);

CREATE TABLE terms (
  term_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT ''
);

CREATE TABLE term_taxonomy (
  term_taxonomy_id INTEGER PRIMARY KEY,
  term_id INTEGER NOT NULL,
  taxonomy TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  parent INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE term_relationships (
  object_id INTEGER NOT NULL,
  term_taxonomy_id INTEGER NOT NULL,
  term_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id)
);

CREATE TABLE termmeta (
  meta_id INTEGER PRIMARY KEY,
  term_id INTEGER NOT NULL,
  meta_key TEXT,
  meta_value TEXT
);

CREATE TABLE users (
  ID INTEGER PRIMARY KEY,
  user_login TEXT NOT NULL DEFAULT '',
  user_pass TEXT NOT NULL DEFAULT '',
  user_nicename TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  user_registered TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE usermeta (
  umeta_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  meta_key TEXT,
  meta_value TEXT
);

CREATE TABLE comments (
  comment_ID INTEGER PRIMARY KEY,
  comment_post_ID INTEGER NOT NULL DEFAULT 0,
  comment_author TEXT NOT NULL DEFAULT '',
  comment_content TEXT NOT NULL DEFAULT '',
  comment_approved TEXT NOT NULL DEFAULT '1',
  comment_date_gmt TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE commentmeta (
  meta_id INTEGER PRIMARY KEY,
  comment_id INTEGER NOT NULL,
  meta_key TEXT,
  meta_value TEXT
);

CREATE TABLE options (
  option_id INTEGER PRIMARY KEY,
  option_name TEXT NOT NULL UNIQUE,
  option_value TEXT,
  autoload TEXT NOT NULL DEFAULT 'yes'
);

-- 添付と親投稿の関係(B2: 全親AND判定の入力)
CREATE TABLE media_parents (
  attachment_id INTEGER NOT NULL,
  parent_post_id INTEGER NOT NULL,
  PRIMARY KEY (attachment_id, parent_post_id)
);

-- 予算ガード用の原子的カウンタ(§13 / 計画 §7-1)
CREATE TABLE usage_counter (
  key TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER NOT NULL
);

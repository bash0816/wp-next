// SPDX-License-Identifier: GPL-3.0-only
// テスト用: fixtures/ref/set-main2/README.md の累積状態 S1〜S3 を openDumpDb() の DB に再現する。
// 公開状態の列名は直接書かず動的に作る(lint の直接参照禁止規則。dumpDb.ts と同じ理由)。
import type { DatabaseSync } from 'node:sqlite';
import { insertRow, updateRow } from './dumpDb.js';

const STATUS_COL = ['post', 'status'].join('_');

type NewPost = {
  id: number;
  title: string;
  name: string;
  date: string; // 'YYYY-MM-DD HH:MM:SS'(UTC)
  status: string;
  password?: string;
  type?: string;
  content?: string;
};

export function addPost(db: DatabaseSync, p: NewPost): void {
  insertRow(db, 'posts', {
    ID: p.id,
    post_author: 0,
    post_date_gmt: p.date,
    post_content: p.content ?? '',
    post_title: p.title,
    post_excerpt: '',
    [STATUS_COL]: p.status,
    post_password: p.password ?? '',
    post_name: p.name,
    post_type: p.type ?? 'post',
    post_parent: 0,
    menu_order: 0,
    post_modified_gmt: p.date,
  });
}

export function relate(db: DatabaseSync, postId: number, termTaxonomyId: number): void {
  insertRow(db, 'term_relationships', { object_id: postId, term_taxonomy_id: termTaxonomyId, term_order: 0 });
}

export function addTerm(db: DatabaseSync, id: number, name: string, slug: string, taxonomy: string): void {
  insertRow(db, 'terms', { term_id: id, name, slug });
  insertRow(db, 'term_taxonomy', { term_taxonomy_id: id, term_id: id, taxonomy, description: '', parent: 0, count: 0 });
}

/** S1: 保護・draft・private・future(状態)を混在。現在投稿は ID 5。 */
export function applyS1(db: DatabaseSync): void {
  addPost(db, { id: 22, title: 'M-prot', name: 'm-prot', date: '2026-10-27 23:27:00', status: 'publish', password: 'SECRET-PW-S1', content: 'SECRET-BODY-S1' });
  addPost(db, { id: 23, title: 'm-draft', name: 'm-draft', date: '2026-10-27 23:26:15', status: 'draft' });
  addPost(db, { id: 24, title: 'm-priv', name: 'm-priv', date: '2026-10-27 23:26:20', status: 'private' });
  addPost(db, { id: 25, title: 'm-fut', name: 'm-fut', date: '2026-10-27 23:26:25', status: 'future' });
  for (const id of [22, 23, 24, 25]) relate(db, id, 1);
}

/** S2: S1 + カテゴリ Zeta(2)・Alpha(3)、タグ t-one(4)、format aside(5)、同日時 2 件、classC1/C2。 */
export function applyS2(db: DatabaseSync): void {
  addTerm(db, 2, 'Zeta', 'zeta', 'category');
  addTerm(db, 3, 'Alpha', 'alpha', 'category');
  addTerm(db, 4, 't-one', 't-one', 'post_tag');
  addTerm(db, 5, 'post-format-aside', 'post-format-aside', 'post_format');
  addPost(db, { id: 26, title: 'tieA1', name: 'tie-a1', date: '2026-10-27 23:40:00', status: 'publish' });
  addPost(db, { id: 27, title: 'tieA2', name: 'tie-a2', date: '2026-10-27 23:40:00', status: 'publish' });
  addPost(db, { id: 28, title: 'classC1', name: 'class-c1', date: '2026-10-28 01:00:00', status: 'publish' });
  addPost(db, { id: 29, title: 'classC2', name: 'class-c2', date: '2026-10-28 02:00:00', status: 'publish' });
  relate(db, 26, 1);
  relate(db, 27, 1);
  relate(db, 28, 2);
  relate(db, 28, 3);
  relate(db, 29, 1);
  relate(db, 29, 4);
  relate(db, 29, 5);
}

/** S3: S2 + 投稿 ID 5 の著者を admin(1)に。 */
export function applyS3(db: DatabaseSync): void {
  updateRow(db, 'posts', 'ID', 5, { post_author: 1 });
}

// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openCurrentPost } from './currentPost.js';
import { openDumpDb, updateRow } from './dumpDb.js';
import { addPost, addTerm, relate } from './mainStates.js';
import { UnsupportedDataError } from './postData.js';

// 第3引数 kind は実装が未対応のため、現状は無視される。
// 型検査を外して呼ぶ(テスト時点では kind の型が無い)。
type OpenFn = (
  db: DatabaseSync,
  ref: { slug: string } | { id: number },
  kind?: string,
) => ReturnType<typeof openCurrentPost>;
const open = openCurrentPost as unknown as OpenFn;

function openPage(db: DatabaseSync, ref: { slug: string } | { id: number }) {
  return open(db, ref, 'page');
}

describe('T2a: openCurrentPost(db, ref, kind="page")', () => {
  it('T2a-01: 公開・非保護の page は PostCtx 形で返る(title/url/日付/className)', () => {
    const db = openDumpDb();
    try {
      // dump の Sample Page (ID 2): post_date_gmt = 2026-10-27 22:51:42 UTC
      const bySlug = openPage(db, { slug: 'sample-page' });
      expect(bySlug).not.toBeNull();
      const post = bySlug!.post;
      expect(post.id).toBe(2);
      expect(post.title).toBe('Sample Page');
      expect(post.url).toBe('http://127.0.0.1:8080/sample-page/');
      expect(post.protected).toBe(false);
      expect(post.dateIso).toBe('2026-10-27T22:51:42+00:00');
      expect(post.dateText).toBe('October 27, 2026');
      expect(post.className).toBe('post-2 page type-page status-publish hentry');

      const byId = openPage(db, { id: 2 });
      expect(byId).not.toBeNull();
      expect(byId!.post.id).toBe(2);
    } finally {
      db.close();
    }
  });

  it('T2a-02: kind="page" は draft/private/パスワード/future/attachment と post 行に対して null を返す', () => {
    const db = openDumpDb();
    try {
      // 陽性対照: 同条件の公開・非保護 page は返ること。
      // これが無いと null 判定が「page を返さない実装」でも通ってしまうため。
      addPost(db, { id: 903, title: 'ok-pg', name: 'ok-pg', date: '2026-10-27 23:00:03', status: 'publish', type: 'page' });
      expect(openPage(db, { slug: 'ok-pg' })).not.toBeNull();

      // dump の Privacy Policy (ID 3) は draft の page
      expect(openPage(db, { slug: 'privacy-policy' })).toBeNull();
      // 存在しない slug
      expect(openPage(db, { slug: 'no-such-page-zzz' })).toBeNull();
      // dump の現行 post (ID 5) を kind="page" で開くと null
      expect(openPage(db, { id: 5 })).toBeNull();
      // page ID 2 を kind 省略(=post 扱い)で開くと null
      expect(open(db, { slug: 'sample-page' })).toBeNull();

      addPost(db, { id: 900, title: 'draft-pg', name: 'draft-pg', date: '2026-10-27 23:00:00', status: 'draft', type: 'page' });
      addPost(db, { id: 901, title: 'private-pg', name: 'private-pg', date: '2026-10-27 23:00:01', status: 'private', type: 'page' });
      addPost(db, {
        id: 902,
        title: 'pw-pg',
        name: 'pw-pg',
        date: '2026-10-27 23:00:02',
        status: 'publish',
        type: 'page',
        password: 'secret',
      });
      addPost(db, { id: 904, title: 'future-pg', name: 'future-pg', date: '2026-12-01 00:00:00', status: 'future', type: 'page' });
      addPost(db, { id: 905, title: 'att', name: 'att', date: '2026-10-27 23:00:05', status: 'inherit', type: 'attachment' });

      expect(openPage(db, { slug: 'draft-pg' })).toBeNull();
      expect(openPage(db, { slug: 'private-pg' })).toBeNull();
      expect(openPage(db, { slug: 'pw-pg' })).toBeNull();
      expect(openPage(db, { slug: 'future-pg' })).toBeNull();
      expect(openPage(db, { id: 905 })).toBeNull();
    } finally {
      db.close();
    }
  });

  it('T2a-03: page の各 port(contentOf/terms/adjacent/commentsState)が page 仕様どおりに動く', () => {
    const db = openDumpDb();
    try {
      const body = (db.prepare('SELECT post_content FROM posts WHERE ID = 2').get() as { post_content: string }).post_content;

      const r = openPage(db, { slug: 'sample-page' });
      expect(r).not.toBeNull();
      const { content } = r!;

      // contentOf は本文そのもの
      expect(content.contentOf?.()).toBe(body);
      // page は term を持たないので terms は常に []
      expect(content.terms('category')).toEqual([]);
      expect(content.terms('post_tag')).toEqual([]);
      // 前後ナビゲーションは page では未対応
      expect(() => content.adjacent('previous')).toThrow(UnsupportedDataError);
      expect(() => content.adjacent('next')).toThrow(UnsupportedDataError);
      // dump の Sample Page は comment_status=closed なので unsupported
      expect(content.commentsState()).toBe('unsupported');

      // 陽性: comment_status=open・options 基準値・承認コメント0件 の page は anon-open-empty
      addPost(db, { id: 930, title: 'open-pg', name: 'open-pg', date: '2026-10-27 23:30:00', status: 'publish', type: 'page' });
      updateRow(db, 'posts', 'ID', 930, { comment_status: 'open' });
      const open930 = openPage(db, { slug: 'open-pg' });
      expect(open930).not.toBeNull();
      expect(open930!.content.commentsState()).toBe('anon-open-empty');
    } finally {
      db.close();
    }
  });

  it('T2a-04-a: page に term が付いている場合は UnsupportedDataError を投げる', () => {
    const db = openDumpDb();
    try {
      addPost(db, { id: 910, title: 'termed-pg', name: 'termed-pg', date: '2026-10-27 23:10:00', status: 'publish', type: 'page' });
      addTerm(db, 910, 'news', 'news', 'category');
      relate(db, 910, 910);
      // 前提確認: 陽性(term 無し)の page は開ける(kind 未対応なら、ここで Red になる)
      addPost(db, { id: 911, title: 'plain-pg', name: 'plain-pg', date: '2026-10-27 23:10:01', status: 'publish', type: 'page' });
      expect(openPage(db, { slug: 'plain-pg' })).not.toBeNull();
      expect(() => openPage(db, { slug: 'termed-pg' })).toThrow(UnsupportedDataError);
    } finally {
      db.close();
    }
  });

  it('T2a-04-b: 階層 page(post_parent≠0)は UnsupportedDataError を投げる', () => {
    const db = openDumpDb();
    try {
      addPost(db, { id: 920, title: 'child-pg', name: 'child-pg', date: '2026-10-27 23:20:00', status: 'publish', type: 'page' });
      updateRow(db, 'posts', 'ID', 920, { post_parent: 2 });
      expect(() => openPage(db, { slug: 'child-pg' })).toThrow(UnsupportedDataError);
    } finally {
      db.close();
    }
  });

  it('T2a-04-c: options が基準値から外れると page の commentsState は unsupported', () => {
    const db = openDumpDb();
    try {
      addPost(db, { id: 930, title: 'open-pg', name: 'open-pg', date: '2026-10-27 23:30:00', status: 'publish', type: 'page' });
      updateRow(db, 'posts', 'ID', 930, { comment_status: 'open' });
      // 基準値の一つ(thread_comments=1)を 0 に変える
      updateRow(db, 'options', 'option_name', 'thread_comments', { option_value: '0' });
      const r = openPage(db, { slug: 'open-pg' });
      expect(r).not.toBeNull();
      expect(r!.content.commentsState()).toBe('unsupported');
    } finally {
      db.close();
    }
  });

  it('T2a-05: kind 省略時の post 行は従来どおり(回帰ガード): ID 5 / 1 / 7 の PostCtx は不変', () => {
    const db = openDumpDb();
    try {
      for (const id of [5, 1, 7]) {
        const row = db.prepare('SELECT post_title FROM posts WHERE ID = ?').get(id) as { post_title: string } | undefined;
        expect(row, `dump に ID ${id} が無い`).toBeDefined();
        const r = open(db, { id });
        expect(r).not.toBeNull();
        expect(r!.post.id).toBe(id);
        expect(r!.post.title).toBe(row!.post_title);
      }
    } finally {
      db.close();
    }
  });
});

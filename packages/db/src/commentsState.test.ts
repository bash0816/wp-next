// SPDX-License-Identifier: GPL-3.0-only
// D3f: content.commentsState() の実装仕様テスト。
// 仕様: ContentPort.commentsState(): 'anon-open-empty' | 'unsupported'(件数は返さない。例外にしない)。
//   'anon-open-empty' になる条件(すべて満たすとき):
//   (1) 投稿の comment_status が 'open'
//   (2) options: comment_registration='0', require_name_email='1', show_comments_cookies_opt_in='1',
//       close_comments_for_old_posts='0', thread_comments='1'(行が無い/他の値は不成立)
//   (3) その投稿の comments 行で comment_approved='1' のものが 0 件(未承認 '0'・スパム 'spam' は数えない)
//   不成立なら 'unsupported'。ポートはその投稿に束縛する。
// 現状: postData.ts の buildContentPort は commentsState で UnsupportedDataError を投げる stub。
//   以下の Red 理由は各 it に記す。
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { insertRow, openDumpDb, updateRow } from './dumpDb.js';
import { applyS1 } from './mainStates.js';
import { openCurrentPost } from './currentPost.js';
import { queryPosts } from './queryPosts.js';

/** 公開・非保護の投稿の content を開く(前提として開けることを確認する)。 */
function contentOf(db: DatabaseSync, id: number) {
  const r = openCurrentPost(db, { id });
  expect(r, `前提: 投稿 ${id} は公開・非保護で開けること`).not.toBeNull();
  return r!.content;
}

/** queryPosts 用の spec(既定値。件数だけ全件が入るよう多めにする)。 */
function spec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { postType: 'post', perPage: 10, pages: 0, offset: 0, order: 'desc', orderBy: 'date', author: '', search: '', exclude: [], sticky: '', inherit: false, taxQuery: null, parents: [], ...over };
}

/** コメント行を挿入する(comment_ID は自動採番)。 */
function addComment(db: DatabaseSync, postId: number, approved: string, content = 'comment-body'): number {
  return insertRow(db, 'comments', {
    comment_post_ID: postId,
    comment_author: 'anon',
    comment_content: content,
    comment_approved: approved,
    comment_date_gmt: '2026-10-30 00:00:00',
    user_id: 0,
  });
}

describe('D3f-01 基準 dump の open・承認済みコメント 0 件の投稿は anon-open-empty', () => {
  // 検出対象: 基準 dump(post 5 と post 7)で 'anon-open-empty' が返ること。
  // Red 理由: buildContentPort の commentsState が UnsupportedDataError を投げ、戻り値が文字列にならない。
  it('post 5(spike-blocks)は anon-open-empty', () => {
    const db = openDumpDb();
    expect(contentOf(db, 5).commentsState()).toBe('anon-open-empty');
  });

  it('post 7 も anon-open-empty', () => {
    const db = openDumpDb();
    expect(contentOf(db, 7).commentsState()).toBe('anon-open-empty');
  });
});

describe('D3f-02 承認済みコメントがある投稿は unsupported', () => {
  // 検出対象: dump の comment_ID 1(post_ID 1、approved '1')を持つ post 1 は 'unsupported'。
  // Red 理由: 'unsupported' を返す代わりに UnsupportedDataError を投げる stub のまま。
  it('post 1(承認済みコメント 1 件あり)は unsupported', () => {
    const db = openDumpDb();
    expect(contentOf(db, 1).commentsState()).toBe('unsupported');
  });
});

describe('D3f-03 件数に数える/数えない(承認済み 1 のみ数える)', () => {
  // 検出対象: 未承認 '0'・スパム 'spam'・ごみ箱 'trash' は件数に含めず、承認済み '1' は 1 件でも数えること。
  // Red 理由: commentsState が UnsupportedDataError を投げ、'anon-open-empty' も 'unsupported' も返らない。
  it.each([
    ['未承認 comment_approved=0', '0'],
    ['スパム comment_approved=spam', 'spam'],
    ['ごみ箱 comment_approved=trash', 'trash'],
  ])('post 5 に %s のコメントだけでは anon-open-empty のまま', (_label, approved) => {
    const db = openDumpDb();
    addComment(db, 5, approved);
    expect(contentOf(db, 5).commentsState()).toBe('anon-open-empty');
  });

  it('post 5 に承認済み(1)を 1 件足すと unsupported', () => {
    const db = openDumpDb();
    addComment(db, 5, '1');
    expect(contentOf(db, 5).commentsState()).toBe('unsupported');
  });

  // comments テーブルには comment_type 列が無い(schema.sql)ため、pingback も通常の承認済み行と同じ扱いになる。
  // ここでは種別で区別せず、approved '1' の行が 1 件あれば unsupported になることを確認する。
  it('post 5 に承認済み行(pingback 相当の内容)を足すと unsupported(種別は数えに影響しない)', () => {
    const db = openDumpDb();
    addComment(db, 5, '1', 'https://example.invalid/pingback-source');
    expect(contentOf(db, 5).commentsState()).toBe('unsupported');
  });
});

describe('D3f-04 comment_status が open のときだけ anon-open-empty(投稿に束縛)', () => {
  // 検出対象: post 5 の comment_status が 'closed' なら unsupported、他の投稿には影響しないこと。
  // Red 理由: commentsState が UnsupportedDataError を投げ、戻り値を比較できない。
  it('post 5 の comment_status を closed にすると unsupported', () => {
    const db = openDumpDb();
    updateRow(db, 'posts', 'ID', 5, { comment_status: 'closed' });
    expect(contentOf(db, 5).commentsState()).toBe('unsupported');
  });

  it('post 5 を closed にしても post 7(open のまま)は anon-open-empty', () => {
    const db = openDumpDb();
    updateRow(db, 'posts', 'ID', 5, { comment_status: 'closed' });
    expect(contentOf(db, 7).commentsState()).toBe('anon-open-empty');
  });

  it("comment_status が 'open' のままなら post 5 は anon-open-empty", () => {
    const db = openDumpDb();
    updateRow(db, 'posts', 'ID', 5, { comment_status: 'open' });
    expect(contentOf(db, 5).commentsState()).toBe('anon-open-empty');
  });
});

describe('D3f-05 options の 1 項目でも不成立なら unsupported', () => {
  // 検出対象: 5 項目のうち 1 つだけ条件外の値にすると、他が正しくても 'unsupported' になること。
  // Red 理由: commentsState が UnsupportedDataError を投げ、'unsupported' の文字列を返さない。
  it.each([
    ['comment_registration', '1'],
    ['require_name_email', '0'],
    ['show_comments_cookies_opt_in', '0'],
    ['close_comments_for_old_posts', '1'],
    ['thread_comments', '0'],
  ])('%s=%s なら unsupported', (name, value) => {
    const db = openDumpDb();
    updateRow(db, 'options', 'option_name', name, { option_value: value });
    expect(contentOf(db, 5).commentsState()).toBe('unsupported');
  });

  it.each([
    'comment_registration',
    'require_name_email',
    'show_comments_cookies_opt_in',
    'close_comments_for_old_posts',
    'thread_comments',
  ])('%s の行を削除(未設定)すると unsupported', (name) => {
    const db = openDumpDb();
    db.prepare('DELETE FROM options WHERE option_name = ?').run(name);
    expect(contentOf(db, 5).commentsState()).toBe('unsupported');
  });

  it.each(['', ' '])('値が %j(空白系)なら unsupported', (value) => {
    const db = openDumpDb();
    updateRow(db, 'options', 'option_name', 'thread_comments', { option_value: value });
    expect(contentOf(db, 5).commentsState()).toBe('unsupported');
  });
});

describe('D3f-06 漏えい防止: 戻り値は 2 値のみ、コメント本文を含めない', () => {
  // 検出対象: 戻り値は 'anon-open-empty' | 'unsupported' のどちらかだけで、例外も投げず、
  //   コメント本文(SECRET-COMMENT)は戻り値・例外メッセージのどちらにも現れないこと。
  // Red 理由: commentsState が UnsupportedDataError を投げる(例外メッセージ自体は本文を含まないが、戻り値が 2 値にならない)。
  const ALLOWED = ['anon-open-empty', 'unsupported'];

  function callCapturing(fn: () => unknown): { out: unknown; err: unknown } {
    try {
      return { out: fn(), err: undefined };
    } catch (e) {
      return { out: undefined, err: e };
    }
  }

  it('未承認コメントに SECRET-COMMENT があっても戻り値は anon-open-empty で本文は現れない', () => {
    const db = openDumpDb();
    addComment(db, 5, '0', 'SECRET-COMMENT');
    addComment(db, 5, 'spam', 'SECRET-COMMENT');
    const { out, err } = callCapturing(() => contentOf(db, 5).commentsState());
    expect(err, '例外を投げないこと').toBeUndefined();
    expect(ALLOWED).toContain(out);
    expect(String(out)).not.toContain('SECRET-COMMENT');
  });

  it('承認済みコメントに SECRET-COMMENT があっても戻り値は unsupported で本文は現れない', () => {
    const db = openDumpDb();
    addComment(db, 5, '1', 'SECRET-COMMENT');
    const { out, err } = callCapturing(() => contentOf(db, 5).commentsState());
    expect(err, '例外を投げないこと').toBeUndefined();
    expect(out).toBe('unsupported');
    expect(String(out)).not.toContain('SECRET-COMMENT');
  });
});

describe('D3f-07 束縛: queryPosts の各項目は自分の投稿を基準に判定する', () => {
  // 検出対象: queryPosts の項目 content.commentsState() が、項目ごとの投稿の状態で判定されること。
  // Red 理由: commentsState が UnsupportedDataError を投げ、項目ごとの判定結果を得られない。
  it('S0: 投稿 1 は unsupported、投稿 5 と 7 は anon-open-empty', () => {
    const db = openDumpDb();
    const items = queryPosts(db, spec());
    const byId = new Map(items.map((it) => [it.post.id, it]));
    for (const id of [7, 5, 1]) {
      expect(byId.has(id), `前提: queryPosts に投稿 ${id} が含まれること`).toBe(true);
    }
    expect(byId.get(1)!.content.commentsState()).toBe('unsupported');
    expect(byId.get(5)!.content.commentsState()).toBe('anon-open-empty');
    expect(byId.get(7)!.content.commentsState()).toBe('anon-open-empty');
  });

  it('S1 で保護投稿 22 は自分の投稿(承認済みなし)を基準に anon-open-empty、他投稿の承認済みに引きずられない', () => {
    const db = openDumpDb();
    applyS1(db);
    addComment(db, 5, '1');
    const items = queryPosts(db, spec());
    const byId = new Map(items.map((it) => [it.post.id, it]));
    expect(byId.has(22), '前提: queryPosts に保護投稿 22 が含まれること').toBe(true);
    expect(byId.get(22)!.post.protected).toBe(true);
    // 投稿 5 にだけ承認済みを足したので、22 は anon-open-empty、5 は unsupported になる。
    expect(byId.get(22)!.content.commentsState()).toBe('anon-open-empty');
    expect(byId.get(5)!.content.commentsState()).toBe('unsupported');
  });
});

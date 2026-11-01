// SPDX-License-Identifier: GPL-3.0-only
// STEP8 指摘(Blocker)の修正テスト: 保護投稿はタイトルとリンクだけをポート境界の外へ出す(ADR-027)。
import { describe, expect, it } from 'vitest';
import { openDumpDb } from './dumpDb.js';
import { applyS1 } from './mainStates.js';
import { queryPosts } from './queryPosts.js';
import { UnsupportedDataError } from './postData.js';

const SPEC = {
  postType: 'post', perPage: 4, pages: 0, offset: 0, order: 'desc', orderBy: 'date',
  author: '', search: '', exclude: [], sticky: '', inherit: false, taxQuery: null, parents: [],
};

function items() {
  const db = openDumpDb();
  applyS1(db);
  return queryPosts(db, SPEC);
}

describe('STEP8-1: 保護投稿の DTO とポートはタイトル・URL・クラス以外を出さない', () => {
  it('保護項目(ID 22)の PostCtx に日付がない(dateIso / dateText は空文字)', () => {
    const p = items().find((i) => i.post.id === 22)!;
    expect(p.post.protected).toBe(true);
    expect(p.post.dateIso).toBe('');
    expect(p.post.dateText).toBe('');
    expect(p.post.title).toBe('M-prot');
    expect(p.post.url).toBe('http://127.0.0.1:8080/m-prot/');
    expect(p.post.className).toContain('post-password-required');
  });
  it('非保護項目の日付は従来どおり出る', () => {
    const p = items().find((i) => i.post.id === 7)!;
    expect(p.post.dateIso).toBe('2026-10-27T23:38:31+00:00');
    expect(p.post.dateText).toBe('October 27, 2026');
  });
  it.each([
    ['terms(category)', (c: ReturnType<typeof items>[number]['content']) => c.terms('category')],
    ['terms(post_tag)', (c: ReturnType<typeof items>[number]['content']) => c.terms('post_tag')],
    ['author', (c: ReturnType<typeof items>[number]['content']) => c.author()],
    ['adjacent(next)', (c: ReturnType<typeof items>[number]['content']) => c.adjacent('next')],
    ['adjacent(previous)', (c: ReturnType<typeof items>[number]['content']) => c.adjacent('previous')],
    ['commentsState', (c: ReturnType<typeof items>[number]['content']) => c.commentsState()],
    ['hasThumbnail', (c: ReturnType<typeof items>[number]['content']) => c.hasThumbnail()],
  ])('保護項目のポート %s は UnsupportedDataError(情報を返さない)', (_n, call) => {
    const p = items().find((i) => i.post.id === 22)!;
    expect(() => call(p.content)).toThrow(UnsupportedDataError);
    expect('contentOf' in p.content && p.content.contentOf !== undefined).toBe(false);
  });
  it('非保護項目のポートは従来どおり動く', () => {
    const p = items().find((i) => i.post.id === 5)!;
    expect(p.content.terms('category').length).toBe(1);
    expect(typeof p.content.contentOf).toBe('function');
  });
  it('例外メッセージに保護投稿の日時・題名・slug を含めない', () => {
    const p = items().find((i) => i.post.id === 22)!;
    try {
      p.content.terms('category');
    } catch (e) {
      const m = String((e as Error).message);
      expect(m).not.toContain('M-prot');
      expect(m).not.toContain('m-prot');
      expect(m).not.toContain('2026-10-27');
    }
  });
});

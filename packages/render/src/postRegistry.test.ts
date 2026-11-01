// SPDX-License-Identifier: GPL-3.0-only
// D-3d0 STEP4: 投稿本文用レジストリ(createPostRegistry)と renderContent の新契約のテスト(D3d0-06〜12)。
// 実装前のため Red になるのが正しい。各テストの Red 理由をコメントに残す。
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LatestPost, QueriesPort } from '@wpn/core/ports';
import { createPostRegistry } from './blockRegistry.js';
import { extractEntryContent, htmlEquals } from './normalizeDom.js';
import { UnsupportedBlockError } from './renderBlocks.js';
import { renderContent } from './renderContent.js';

const SITE_URL = 'http://127.0.0.1:8080';
const FIXTURES = new URL('../../../fixtures/ref/', import.meta.url);

// DB 非依存のスタブ。D3d0-06/07 では latest-posts を含めないため呼ばれない想定。
const stubQueries: QueriesPort = {
  queryPosts: () => [],
  latestPosts: () => [],
};

function stubCtx(): { queries: QueriesPort; siteUrl: string } {
  return { queries: stubQueries, siteUrl: SITE_URL };
}

// latest-posts の spec を記録する DB 非依存スタブ。
function recordingCtx(rows: LatestPost[] = []): {
  ctx: { queries: QueriesPort; siteUrl: string };
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const queries: QueriesPort = {
    queryPosts: () => [],
    latestPosts: (spec) => {
      calls.push(spec);
      return rows;
    },
  };
  return { ctx: { queries, siteUrl: SITE_URL }, calls };
}

function readFixture(relPath: string): string {
  return readFileSync(new URL(relPath, FIXTURES), 'utf8');
}

// D3d0-06: 投稿本文用レジストリのキーは 7 個で完全一致し、凍結されている。
// Red の理由: 現行 createPostRegistry は core/group・core/query 等のテーマ用キーを登録しているため
// 完全一致が崩れる(実装後は 7 個のみになる想定)。
// 実行結果: keys が [] になる(assert: expected [] to deeply equal [...])。現行の createPostRegistry は空を返すため。
describe('createPostRegistry (D3d0-06)', () => {
  const EXPECTED_KEYS = [
    'core/heading',
    'core/paragraph',
    'core/list',
    'core/list-item',
    'core/quote',
    'core/separator',
    'core/latest-posts',
  ];

  it('キーは 7 個の完全一致で、テーマ用キー(core/group・core/query 等)を含まない', () => {
    const registry = createPostRegistry();
    const keys = [...registry.keys()].sort();
    expect(keys).toEqual([...EXPECTED_KEYS].sort());
    expect(keys).toHaveLength(7);
    expect(keys).not.toContain('core/group');
    expect(keys).not.toContain('core/query');
  });

  it('レジストリ本体が凍結されている', () => {
    const registry = createPostRegistry();
    expect(Object.isFrozen(registry)).toBe(true);
  });
});

// D3d0-07: 投稿本文にテーマ専用/未登録ブロックがあると UnsupportedBlockError(全階層で検査)。
// 実行結果: 11 件すべて PASS。現行 renderContent は renderBlocks 経路で既に
// テーマ専用ブロックに UnsupportedBlockError を投げるため、Red にならず回帰ガードとして機能する。
// よって D3d0-07 は「新契約で Red」ではなく「現行挙動の回帰ガード」として扱う。
describe('投稿本文の未登録ブロック検出 (D3d0-07)', () => {
  const THEME_ONLY_BLOCKS = [
    'wp:query',
    'wp:post-content',
    'wp:comments',
    'wp:navigation',
    'wp:group',
    'wp:columns',
    'wp:site-title',
    'wp:unknown/x',
  ];

  it.each(THEME_ONLY_BLOCKS)('トップレベルの %s は UnsupportedBlockError', (name) => {
    const content = `<!-- ${name} /-->`;
    expect(() => renderContent(content, stubCtx())).toThrow(UnsupportedBlockError);
  });

  // 対照: 許可ブロック(段落)は例外にならず描画される(検査が全ブロック一律の例外で空振りしないことの確認)。
  it('対照: 段落は UnsupportedBlockError にならず <p>ok</p> を出力する', () => {
    const content = '<!-- wp:paragraph --><p>ok</p><!-- /wp:paragraph -->';
    expect(renderContent(content, stubCtx())).toMatch(/<p[^>]*>ok<\/p>/);
  });

  it('list-item の内側に wp:query が混入していても UnsupportedBlockError', () => {
    const content =
      '<!-- wp:list --><ul class="wp-block-list">' +
      '<!-- wp:list-item --><li><!-- wp:query /--></li><!-- /wp:list-item -->' +
      '</ul><!-- /wp:list -->';
    expect(() => renderContent(content, stubCtx())).toThrow(UnsupportedBlockError);
  });

  it('quote の内側に wp:query が混入していても UnsupportedBlockError', () => {
    const content =
      '<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:query /--></blockquote><!-- /wp:quote -->';
    expect(() => renderContent(content, stubCtx())).toThrow(UnsupportedBlockError);
  });
});

// D3d0-08: 投稿本文の出力は sanitizeHtml を通り、危険な要素・属性・URL スキームが残らない。
// 結果(run4): 7 件すべて PASS。Red ではなく回帰ガード。段落・見出し・list-item・quote の静的本文は
// 現行 renderBlocks 経路でも sanitize が効いており、新契約でも同じ出力を保つことを守る。
// stubCtx(db なし)でも静的ブロックのみのため現行実装で例外にならない。
describe('投稿本文の sanitize (D3d0-08)', () => {
  const FORBIDDEN = /<script|onerror|javascript:|onclick|<iframe|<style/i;
  const DANGEROUS_CASES: Array<[string, string]> = [
    ['段落内の script', '<!-- wp:paragraph --><p>a<script>alert(1)</script></p><!-- /wp:paragraph -->'],
    ['段落内の img onerror', '<!-- wp:paragraph --><p><img src="x" onerror="alert(1)"></p><!-- /wp:paragraph -->'],
    ['段落内の a javascript:', '<!-- wp:paragraph --><p><a href="javascript:alert(1)">x</a></p><!-- /wp:paragraph -->'],
    [
      '段落内の a data: スキーム',
      '<!-- wp:paragraph --><p><a href="data:text/html;base64,PHNjcmlwdD4=">x</a></p><!-- /wp:paragraph -->',
    ],
    ['見出しの onclick', '<!-- wp:heading --><h2 onclick="alert(1)">h</h2><!-- /wp:heading -->'],
    [
      'list-item 内の iframe',
      '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li><iframe src="https://e.example"></iframe>i</li><!-- /wp:list-item --></ul><!-- /wp:list -->',
    ],
    [
      'quote 内の段落に入った style',
      '<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p><style>p{color:red}</style>q</p><!-- /wp:paragraph --></blockquote><!-- /wp:quote -->',
    ],
  ];

  it.each(DANGEROUS_CASES)('%s は禁止要素・属性・スキームを出力に残さない', (_label, content) => {
    const out = renderContent(content, stubCtx());
    expect(out).toMatch(/\S/);
    expect(out).not.toMatch(FORBIDDEN);
  });
});

// D3d0-09: core/latest-posts は ctx.queries.latestPosts のみを使い、DB に依存しない。
// Red の理由: 新契約の renderContent 未実装のため、spec の受け渡し(limit/order 正規化)と
// DTO からの HTML 生成が現行実装と一致しない想定。
describe('core/latest-posts の DB 非依存テスト (D3d0-09)', () => {
  it('既定属性では latestPosts に {limit:5, order:"desc"} を渡す', () => {
    const { ctx, calls } = recordingCtx();
    renderContent('<!-- wp:latest-posts /-->', ctx as never);
    expect(calls[0]).toEqual({ limit: 5, order: 'desc' });
  });

  it('postsToShow:0 は limit 1 に丸め、9999 は limit 100 に丸める', () => {
    const low = recordingCtx();
    renderContent('<!-- wp:latest-posts {"postsToShow":0} /-->', low.ctx as never);
    expect(low.calls[0]).toEqual({ limit: 1, order: 'desc' });

    const high = recordingCtx();
    renderContent('<!-- wp:latest-posts {"postsToShow":9999} /-->', high.ctx as never);
    expect(high.calls[0]).toEqual({ limit: 100, order: 'desc' });
  });

  it('order:"asc" は spec の order に反映される', () => {
    const { ctx, calls } = recordingCtx();
    renderContent('<!-- wp:latest-posts {"order":"asc"} /-->', ctx as never);
    expect(calls[0]).toEqual({ limit: 5, order: 'asc' });
  });

  it('DTO から href(encodeURIComponent した slug)・保護プレフィックス・カールクォートを組み立てる', () => {
    const rows = [
      { slug: 'a b', title: 'It\'s "x"', isProtected: false },
      { slug: 'secret', title: 'Pw', isProtected: true },
    ];
    const { ctx } = recordingCtx(rows);
    const out = renderContent('<!-- wp:latest-posts {"postsToShow":2} /-->', ctx as never);
    expect(out).toContain(`href="${SITE_URL}/a%20b/"`);
    expect(out).toContain(`href="${SITE_URL}/secret/"`);
    expect(out).toContain('It’s “x”');
    expect(out).toMatch(/Protected: [\s\S]*Pw/);
  });

  it('queries が無い状態で latest-posts を含むと RangeError', () => {
    expect(() => renderContent('<!-- wp:latest-posts /-->', { siteUrl: SITE_URL } as never)).toThrow(RangeError);
  });

  it('latest-posts を含まない静的本文は queries 無しでも描画できる', () => {
    expect(() =>
      renderContent('<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->', { siteUrl: SITE_URL } as never),
    ).not.toThrow();
  });
});

// D3d0-10: packages/render の非テスト src は node:sqlite と @wpn/db に依存しない(境界の静的確認)。
// Red の理由: 現行 renderContent.ts は @wpn/db(selectLatestPublishedPosts)と node:sqlite 型に依存しているため
// 禁止 import が検出される想定。
describe('packages/render の依存境界 (D3d0-10)', () => {
  it('非テストの src/*.ts は node:sqlite と @wpn/db を import しない', () => {
    const srcDir = new URL('.', import.meta.url);
    const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const FORBIDDEN_IMPORT = /(from\s+|import\(\s*)['"](node:sqlite|@wpn\/db(\/[^'"]*)?)['"]/;
    const offenders = files.filter((f) => FORBIDDEN_IMPORT.test(readFileSync(new URL(f, srcDir), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

// D3d0-11: 子ブロック(list-item・quote 内段落・入れ子リスト)が描画され、spike 本文が基準と一致する。
// Red の理由: 新契約の renderContent 未実装。現行は ctx.db を要求するため、子ブロックの描画結果と
// spike 比較が新しい queries 契約で成立しない想定。
// 注: makeQueriesPort は @wpn/db からまだ export されていないため import せず、spike の latest-posts 行
// (fixtures/ref/db/dump.sql の ID 7,5,1 相当の DTO)をスタブで与える。
describe('子ブロックと spike 本文 (D3d0-11)', () => {
  it('複数の list-item がすべて描画される', () => {
    const content =
      '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>a</li><!-- /wp:list-item -->' +
      '<!-- wp:list-item --><li>b</li><!-- /wp:list-item --><!-- wp:list-item --><li>c</li><!-- /wp:list-item -->' +
      '</ul><!-- /wp:list -->';
    const out = renderContent(content, stubCtx());
    expect(out).toMatch(/<li[^>]*>a<\/li>/);
    expect(out).toMatch(/<li[^>]*>b<\/li>/);
    expect(out).toMatch(/<li[^>]*>c<\/li>/);
    expect(out.match(/<li[^>]*>/g) ?? []).toHaveLength(3);
  });

  it('quote の内側の段落が描画される', () => {
    const content =
      '<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p>q1</p><!-- /wp:paragraph --></blockquote><!-- /wp:quote -->';
    const out = renderContent(content, stubCtx());
    expect(out).toMatch(/<blockquote[^>]*>[\s\S]*<p[^>]*>q1<\/p>[\s\S]*<\/blockquote>/);
  });

  it('入れ子リスト(list-item の内側の list)が描画される', () => {
    const content =
      '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>outer' +
      '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>inner</li><!-- /wp:list-item --></ul><!-- /wp:list -->' +
      '</li><!-- /wp:list-item --></ul><!-- /wp:list -->';
    const out = renderContent(content, stubCtx());
    expect(out.match(/<ul[^>]*>/g) ?? []).toHaveLength(2);
    expect(out).toMatch(/<li[^>]*>outer[\s\S]*<ul[\s\S]*<li[^>]*>inner<\/li>/);
  });

  it('spike-blocks の post_content が基準 WP の entry-content と一致する(latest-posts はスタブ)', () => {
    // 基準の latest-posts は postsToShow:3 → 7,5,1 の順。DTO はその行に対応させる。
    const spikeRows = [
      { slug: 'fixture-two-nested', title: '入れ子 & <特殊> "文字"', isProtected: false },
      { slug: 'spike-blocks', title: 'スパイク用ページ', isProtected: false },
      { slug: 'hello-world', title: 'Hello world!', isProtected: false },
    ];
    const { ctx } = recordingCtx(spikeRows);
    const actual = renderContent(readFixture('spike-blocks.post_content.html'), ctx as never);
    expect(htmlEquals(actual, extractEntryContent(readFixture('spike-blocks.html')))).toBe(true);
  });
});

// D3d0-12: 投稿本文のフリーフォーム(ブロックコメント外の生 HTML)は出力され、危険要素は除去され、
// 空白のみのフリーフォームは出力されない。
// 結果(run4): 3 件すべて PASS。Red ではなく回帰ガード(フリーフォームの通過・script 除去・空白のみ除外は現行でも成立)。
describe('フリーフォーム HTML (D3d0-12)', () => {
  it('ブロックコメント外の生 HTML <p>classic</p> は出力される', () => {
    const out = renderContent('<p>classic</p>', stubCtx());
    expect(out).toMatch(/<p[^>]*>classic<\/p>/);
  });

  it('フリーフォーム内の script は除去され、通常の文は残る', () => {
    const out = renderContent('<script>alert(1)</script><p>safe</p>', stubCtx());
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('safe');
  });

  it('空白のみのフリーフォームは出力されない', () => {
    expect(renderContent('   \n  ', stubCtx())).toBe('');
  });
});

// D3d0 補強(STEP6 mutation 生存): postsToShow の小数、ctx.site 欠落、innerContent に子の位置が無いブロック。
import { renderTree, type RenderCtx } from './blockRegistry.js';
import type { ParsedBlock } from './renderBlocks.js';
describe('postRegistry 補強', () => {
  it('D3d0-09: postsToShow=2.7 は整数に切り捨てられて limit 2 になる', () => {
    const { ctx, calls } = recordingCtx([{ slug: 'a', title: 'A', isProtected: false }]);
    renderContent('<!-- wp:latest-posts {"postsToShow":2.7} /-->', ctx);
    expect(calls).toEqual([{ limit: 2, order: 'desc' }]);
  });
  it('D3d0-09: ctx.site が無いと latest-posts は RangeError(queries は在っても)', () => {
    const ctx = { global: {}, renderState: { modalCounter: 0 }, queries: stubQueries } as unknown as RenderCtx;
    const block: ParsedBlock = { blockName: 'core/latest-posts', attrs: {}, innerBlocks: [], innerHTML: '', innerContent: [] };
    expect(() => renderTree([block], ctx, createPostRegistry())).toThrow(RangeError);
  });
  it('D3d0-11: innerContent に子の位置(null)が無くても子は末尾に描画され握りつぶされない', () => {
    const child: ParsedBlock = { blockName: 'core/separator', attrs: {}, innerBlocks: [], innerHTML: '<hr/>', innerContent: ['<hr/>'] };
    const parent: ParsedBlock = { blockName: 'core/list', attrs: {}, innerBlocks: [child], innerHTML: '<ul></ul>', innerContent: ['<ul>', '</ul>'] };
    const ctx = { global: {}, renderState: { modalCounter: 0 } } as unknown as RenderCtx;
    expect(renderTree([parent], ctx, createPostRegistry())).toContain('<hr/>');
  });
});

describe('postRegistry 補強2', () => {
  it('D3d0-12: freeform は内容を変えずに通す(余計な文字を足さない)', () => {
    expect(renderContent('<p>classic</p>', stubCtx())).toBe('<p>classic</p>');
  });
});

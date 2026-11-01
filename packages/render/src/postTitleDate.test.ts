// SPDX-License-Identifier: GPL-3.0-only
// D3a2 STEP4: postTitleRenderer / postDateRenderer のテスト(実装は未作成。Red 確認が目的)。
// 期待値は fixtures/ref からの正規表現抽出のみ。実装出力を手で写さない。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { htmlEquals } from './normalizeDom.js';
import { postTitleRenderer, postDateRenderer } from './postTitleDate.js';
import type { ParsedBlock } from './renderBlocks.js';
import type { RenderCtx } from './blockRegistry.js';
import type { PostCtx } from './ports.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(FIXTURES, rel), 'utf8');
}

function fixtureMatch(rel: string, re: RegExp): RegExpExecArray {
  const m = re.exec(readFixture(rel));
  if (!m) throw new Error(`fixture pattern not found: ${rel} ${re}`);
  return m;
}

function blk(blockName: string, attrs: Record<string, unknown>): ParsedBlock {
  return { blockName, attrs, innerBlocks: [], innerHTML: '', innerContent: [] };
}

function ctxWith(p: PostCtx): RenderCtx {
  return { global: {}, renderState: {}, post: p } as unknown as RenderCtx;
}

function post(over: Partial<PostCtx> = {}): PostCtx {
  return {
    id: 7,
    title: 'T',
    url: 'http://127.0.0.1:8080/t/',
    protected: false,
    className: '',
    dateIso: '2026-10-27T23:38:31+00:00',
    dateText: 'October 27, 2026',
    ...over,
  };
}

function runTitle(attrs: Record<string, unknown>, p: PostCtx): string {
  postTitleRenderer.validateAttrs(attrs);
  return postTitleRenderer.render(blk('core/post-title', attrs), ctxWith(p), () => '');
}

function runDate(attrs: Record<string, unknown>, p: PostCtx): string {
  postDateRenderer.validateAttrs(attrs);
  return postDateRenderer.render(blk('core/post-date', attrs), ctxWith(p), () => '');
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

type El = { tagName: string; attrs: Array<{ name: string; value: string }> };

function allElements(html: string): El[] {
  const out: El[] = [];
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) {
      out.push({ tagName: node.tagName, attrs: node.attrs });
    }
    if ('childNodes' in node) {
      node.childNodes.forEach(visit);
    }
  };
  parseFragment(html).childNodes.forEach(visit);
  return out;
}

// パース後のテキストノードを連結して返す(エスケープ解除後の見た目の文字列を確認するため)。
function textOf(html: string): string {
  let s = '';
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('value' in node && typeof node.value === 'string') s += node.value;
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  parseFragment(html).childNodes.forEach(visit);
  return s;
}

describe('postTitle / postDate (D3a2)', () => {
  // D3a2-06: main-01 の post-title (h1, 非リンク)。level:1 の出力を fixture と比較する。
  // Red理由: postTitleDate.ts 未作成のため import 失敗。
  // Green時に落ちる場合: level→タグ変換、非リンク時のクラス、タイトルのエスケープ(日本語はそのまま)。
  it('D3a2-06: main-01 の h1 post-title が fixture と一致する', () => {
    const m = fixtureMatch('regions/main-01.html', /<h1 class="wp-block-post-title">([^<]+)<\/h1>/);
    const out = runTitle({ level: 1 }, post({ title: m[1] ?? '' }));
    expect(htmlEquals(out, m[0])).toBe(true);
  });

  // D3a2-07: main-02 の投稿カード(post 7)。h3 リンク付きタイトルと post-date を fixture と比較する。
  // 入力タイトルは仕様書記載の生値 `入れ子 & <特殊> "文字"`(fixture は HTML エスケープ済み)。
  // Red理由: 未作成のため import 失敗。
  // Green時に落ちる場合: 生値の `"` の曲線化、& < > のエスケープ、isLink の a 要素と target="_self"、date の textAlign と time 要素。
  it('D3a2-07: post 7 の h3 と post-date が main-02.html と一致し、タイトル文字列が正しく出る', () => {
    const title = fixtureMatch(
      'regions/main-02.html',
      /<h3 class="wp-block-post-title has-large-font-size"><a href="([^"]+)" target="_self" >[^\n]*?<\/a><\/h3>/,
    );
    const date = fixtureMatch(
      'regions/main-02.html',
      /<div class="has-text-align-right wp-block-post-date"><a href="[^"]+"><time datetime="([^"]+)">([^<]+)<\/time><\/a><\/div>/,
    );
    const p = post({
      id: 7,
      title: '入れ子 & <特殊> "文字"',
      url: title[1] ?? '',
      dateIso: date[1] ?? '',
      dateText: date[2] ?? '',
      protected: false,
    });
    const h3 = runTitle({ level: 3, isLink: true, fontSize: 'large' }, p);
    const div = runDate({ textAlign: 'right', isLink: true }, p);
    expect(htmlEquals(h3, title[0])).toBe(true);
    expect(htmlEquals(div, date[0])).toBe(true);

    // パース後のテキストは曲線引用符と生の山括弧を含む(特殊 は要素にならない)。
    expect(textOf(h3)).toBe('入れ子 & <特殊> “文字”');
    expect(allElements(h3).some((e) => e.tagName === '特殊')).toBe(false);
  });

  // D3a2-08: 保護済み投稿(post-22, title M-prot)。タイトルに "Protected: " が付き、post-date は空文字。
  // Red理由: 未作成のため import 失敗。
  // Green時に落ちる場合: protected 時の接頭辞欠落、post-date の空文字化の抜け。
  it('D3a2-08: 保護済み投稿は "Protected: " 付き h3 を出し post-date は空文字', () => {
    const file = 'set-main2/main.mixed-status-protected-adjacent.html';
    // 前提確認: post-22 の li に post-date が無いこと(fixture 側の事実確認)。
    const li = fixtureMatch(file, /<li class="wp-block-post post-22[\s\S]*?<\/li>/);
    expect(li[0].includes('wp-block-post-date')).toBe(false);

    const h3 = fixtureMatch(
      file,
      /<h3 class="(wp-block-post-title[^"]*)"><a href="(http:\/\/127\.0\.0\.1:8080\/m-prot\/)"[^>]*>Protected: M-prot<\/a><\/h3>/,
    );
    const fs = /has-([a-z0-9-]+)-font-size/.exec(h3[1] ?? '');
    const attrs: Record<string, unknown> = { level: 3, isLink: true };
    if (fs) attrs.fontSize = fs[1];
    const p = post({ id: 22, title: 'M-prot', url: h3[2] ?? '', protected: true });

    expect(htmlEquals(runTitle(attrs, p), h3[0])).toBe(true);
    expect(runDate({ isLink: true }, p)).toBe('');
  });

  // D3a2-09: エスケープ。script 要素は生成せず、URL の `"` で属性を増やさない。javascript: URL は拒否。
  // Red理由: 未作成のため import 失敗。
  // Green時に落ちる場合: タイトルの < > 未エスケープ、URL の属性エスケープ漏れ、javascript: の拒否漏れ。
  it('D3a2-09: タイトルの script はエスケープされ、URL の " は属性を増やさず、javascript: URL は RangeError', () => {
    const out = runTitle({ level: 2 }, post({ title: '<script>alert(1)</script>' }));
    expect(out).toContain('&lt;script&gt;');
    expect(allElements(out).some((e) => e.tagName === 'script')).toBe(false);

    const quoted = 'http://127.0.0.1:8080/x"onmouseover="a';
    const linked = runTitle({ level: 2, isLink: true }, post({ title: 'L', url: quoted }));
    const anchor = allElements(linked).find((e) => e.tagName === 'a');
    expect(anchor).toBeDefined();
    expect(anchor!.attrs.some((a) => a.name === 'onmouseover')).toBe(false);
    expect(anchor!.attrs.find((a) => a.name === 'href')?.value).toBe(quoted);

    const err = captureError(() =>
      runTitle({ level: 2, isLink: true }, post({ title: 'L', url: 'javascript:alert(1)' })),
    );
    expect(err).toBeInstanceOf(RangeError);
  });

  // D3a2-10: 仕様のフェイルクローズ対象タイトルは RangeError。曲線化の正例も確認する。
  // Red理由: 未作成のため import 失敗。
  // Green時に落ちる場合: 禁止文字列の検出漏れ、対の二重引用符の変換漏れ。
  // 曲線化 `"x"` -> `“x”` は仕様書 post-title 項の記載値(paired straight double quotes -> curly)。
  it.each([
    ["it's (apostrophe)", "it's"],
    ['a--b (double hyphen)', 'a--b'],
    ['wait... (ellipsis)', 'wait...'],
    ['(c)', '(c)'],
    ['(R)', '(R)'],
    ['(tm)', '(tm)'],
    ['3x4 (digit x digit)', '3x4'],
    ['unpaired double quote', '"unpaired'],
  ])('D3a2-10: %s は RangeError', (_label, title) => {
    const err = captureError(() => runTitle({ level: 2 }, post({ title })));
    expect(err).toBeInstanceOf(RangeError);
  });

  it('D3a2-10: 対の二重引用符 "x" は曲線引用符 “x” に変換される', () => {
    const out = runTitle({ level: 2 }, post({ title: '"x"' }));
    expect(textOf(out)).toBe('“x”');
  });

  // D3a2-11: 不正な属性・level・文脈の拒否。
  // Red理由: 未作成のため import 失敗。
  // Green時に落ちる場合: level 範囲検証の抜け、許可リスト外キーの素通し、post-date の isLink 必須化漏れ、ctx.post 欠落の検出漏れ。
  it.each([
    ['post-title level 0', 'core/post-title', { level: 0 }],
    ['post-title level 7', 'core/post-title', { level: 7 }],
    ['post-title textAlign', 'core/post-title', { textAlign: 'center' }],
    ['post-title linkTarget', 'core/post-title', { linkTarget: '_blank' }],
    ['post-title rel', 'core/post-title', { rel: 'nofollow' }],
    ['post-date isLink false', 'core/post-date', { isLink: false }],
    ['post-date isLink 省略', 'core/post-date', {}],
    ['post-date textAlign left', 'core/post-date', { isLink: true, textAlign: 'left' }],
  ])('D3a2-11: %s は RangeError', (_label, blockName, attrs) => {
    const err = captureError(() => {
      const renderer = blockName === 'core/post-title' ? postTitleRenderer : postDateRenderer;
      renderer.validateAttrs(attrs);
      renderer.render(blk(blockName, attrs), ctxWith(post()), () => '');
    });
    expect(err).toBeInstanceOf(RangeError);
  });

  it.each([
    ['core/post-title', postTitleRenderer],
    ['core/post-date', postDateRenderer],
  ])('D3a2-11: %s は ctx.post 欠落で RangeError', (blockName, renderer) => {
    const err = captureError(() =>
      renderer.render(blk(blockName, { isLink: true }), {} as unknown as RenderCtx, () => ''),
    );
    expect(err).toBeInstanceOf(RangeError);
  });

  // D3a2-12: level と fontSize の組み合わせを独立に確認する。
  // 期待クラス順 `wp-block-post-title has-<fontSize>-font-size` は main-02 line 11 の並びに従う(仕様書記載)。
  // Red理由: 未作成のため import 失敗。
  // Green時に落ちる場合: 既定 level(2) の欠落、has-*-font-size の位置がずれる、level と fontSize の結合不具合。
  it('D3a2-12: 既定 level は h2、fontSize はクラス末尾に付く', () => {
    const out = runTitle({ fontSize: 'large' }, post({ title: 'T' }));
    const el = allElements(out)[0];
    expect(el?.tagName).toBe('h2');
    expect(el?.attrs.find((a) => a.name === 'class')?.value).toBe('wp-block-post-title has-large-font-size');
  });

  it('D3a2-12: level 1 と fontSize の組み合わせは h1 かつ同じクラス順', () => {
    const out = runTitle({ level: 1, fontSize: 'large' }, post({ title: 'T' }));
    const el = allElements(out)[0];
    expect(el?.tagName).toBe('h1');
    expect(el?.attrs.find((a) => a.name === 'class')?.value).toBe('wp-block-post-title has-large-font-size');
  });
});

// D3a2-10 補強(STEP6 mutation 生存): 数字x数字は大文字 X も保守的に拒否する(未実測の wptexturize 分岐の fail-closed)。
describe('D3a2-10 補強', () => {
  it('D3a2-10: 3X4 も RangeError(保守的拒否)', () => {
    const p: PostCtx = {
      id: 1,
      title: '3X4',
      url: 'http://127.0.0.1:8080/x/',
      protected: false,
      className: '',
      dateIso: '2026-01-01T00:00:00+00:00',
      dateText: 'January 1, 2026',
    };
    postTitleRenderer.validateAttrs({ level: 2 });
    expect(() => postTitleRenderer.render(blk('core/post-title', { level: 2 }), ctxWith(p), () => '')).toThrow(RangeError);
  });
});

// D3a2-11 補強(STEP6 mutation 生存): 型・slug・子ブロックの検査。
describe('D3a2-11 補強', () => {
  const p: PostCtx = {
    id: 1,
    title: 'T',
    url: 'http://127.0.0.1:8080/x/',
    protected: false,
    className: '',
    dateIso: '2026-01-01T00:00:00+00:00',
    dateText: 'January 1, 2026',
  };
  it.each([2.5, NaN, '2', null, Infinity])('D3a2-11: post-title level=%s は RangeError', (level) => {
    expect(() => runTitle({ level }, p)).toThrow(RangeError);
  });
  it.each(['yes', 1, 0, null])('D3a2-11: post-title isLink=%s(boolean 以外)は RangeError', (isLink) => {
    expect(() => runTitle({ isLink }, p)).toThrow(RangeError);
  });
  it.each(['Large', 'a b', 'a"b', '', 1, null])('D3a2-11: post-title fontSize=%s は RangeError', (fontSize) => {
    expect(() => runTitle({ fontSize }, p)).toThrow(RangeError);
  });
  it('D3a2-11: innerBlocks を持つ post-title / post-date は RangeError', () => {
    const child = blk('core/paragraph', {});
    const withChild = (name: string, attrs: Record<string, unknown>): ParsedBlock => ({ ...blk(name, attrs), innerBlocks: [child] });
    expect(() => postTitleRenderer.render(withChild('core/post-title', {}), ctxWith(p), () => '')).toThrow(RangeError);
    expect(() => postDateRenderer.render(withChild('core/post-date', { isLink: true }), ctxWith(p), () => '')).toThrow(RangeError);
  });
});

// SPDX-License-Identifier: GPL-3.0-only
// D3c2 STEP4-A: postTermsRenderer / postAuthorNameRenderer / postFeaturedImageRenderer のテスト(実装は未作成。Red 確認が目的)。
// 期待値は fixtures/ref からの正規表現抽出のみ。実装出力を手で写さない。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFragment } from 'parse5';
import { htmlEquals } from './normalizeDom.js';
import {
  postTermsRenderer,
  postAuthorNameRenderer,
  postFeaturedImageRenderer,
} from './termsAuthor.js';
import type { ParsedBlock } from './renderBlocks.js';
import type { RenderCtx } from './blockRegistry.js';
import type { PostCtx, ContentPort } from './ports.js';

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

// ContentPort は必要なメソッドだけ持つスタブ。
function content(over: Partial<ContentPort> = {}): ContentPort {
  return {
    terms: () => [],
    adjacent: () => null,
    commentsState: () => 'unsupported',
    hasThumbnail: () => false,
    author: () => null,
    ...over,
  };
}

function ctxWith(p: PostCtx | undefined, c: ContentPort | undefined): RenderCtx {
  return { global: {}, renderState: { modalCounter: 0 }, post: p, content: c } as unknown as RenderCtx;
}

function runTerms(attrs: Record<string, unknown>, p: PostCtx, c: ContentPort): string {
  postTermsRenderer.validateAttrs(attrs);
  return postTermsRenderer.render(blk('core/post-terms', attrs), ctxWith(p, c), () => '');
}

describe('D3c2-01 post-terms(category 1 件)', () => {
  it('fontWeight 300 の category 1 件が main-01.html の taxonomy-category 行と一致する', () => {
    const m = fixtureMatch(
      'regions/main-01.html',
      /<div style="font-weight:300" class="taxonomy-category wp-block-post-terms">[\s\S]*?<\/div>/,
    );
    const attrs = { term: 'category', style: { typography: { fontWeight: '300' } } };
    const c = content({
      terms: (tax) =>
        tax === 'category'
          ? [{ name: 'Uncategorized', slug: 'uncategorized', url: 'http://127.0.0.1:8080/category/uncategorized/' }]
          : [],
    });
    const out = runTerms(attrs, post(), c);
    expect(htmlEquals(out, m[0])).toBe(true);
  });

  it('style 無しの category 1 件は style 属性を出さない', () => {
    const attrs = { term: 'category' };
    const c = content({
      terms: (tax) =>
        tax === 'category'
          ? [{ name: 'Uncategorized', slug: 'uncategorized', url: 'http://127.0.0.1:8080/category/uncategorized/' }]
          : [],
    });
    const out = runTerms(attrs, post(), c);
    expect(out).not.toMatch(/style=/);
    expect(out).toContain('class="taxonomy-category wp-block-post-terms"');
  });
});

// ---- 共通ヘルパ(D3c2-02〜07) ----

type TNode = { nodeName: string; tagName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: TNode[] };

// parse5 で断片を解析し、要素一覧を返す(文字列一致ではなく DOM で要素・属性数を検査するため)。
function elements(html: string): Array<{ tagName: string; attrs: Array<{ name: string; value: string }> }> {
  const out: Array<{ tagName: string; attrs: Array<{ name: string; value: string }> }> = [];
  const walk = (n: TNode): void => {
    if (n.tagName) out.push({ tagName: n.tagName, attrs: n.attrs ?? [] });
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(parseFragment(html) as unknown as TNode);
  return out;
}

// 出力 HTML の全テキストノードを連結して返す(エスケープ解除後の実テキストを比較するため)。
function textOf(html: string): string {
  let s = '';
  const walk = (n: TNode & { value?: string }): void => {
    if (n.nodeName === '#text' && typeof n.value === 'string') s += n.value;
    for (const c of n.childNodes ?? []) walk(c as TNode & { value?: string });
  };
  walk(parseFragment(html) as unknown as TNode & { value?: string });
  return s;
}

function oneCat(): ContentPort {
  return content({
    terms: (tax) =>
      tax === 'category'
        ? [{ name: 'Uncategorized', slug: 'uncategorized', url: 'http://127.0.0.1:8080/category/uncategorized/' }]
        : [],
  });
}

function run(
  renderer: { validateAttrs(a: unknown): void; render(b: ParsedBlock, c: RenderCtx, r: () => string): string },
  blockName: string,
  attrs: Record<string, unknown>,
  p: PostCtx | undefined,
  c: ContentPort | undefined,
  innerBlocks: ParsedBlock[] = [],
): string {
  const block = { ...blk(blockName, attrs), innerBlocks };
  renderer.validateAttrs(attrs);
  return renderer.render(block, ctxWith(p, c), () => '');
}

// ---- D3c2-02 category の拒否 ----
// Red 理由: termsAuthor.ts 未存在のため収集失敗。実装後は validateAttrs/render が RangeError を投げることを要求する。
describe('D3c2-02 post-terms(category)の拒否', () => {
  const twoCats = content({
    terms: (tax) =>
      tax === 'category'
        ? [
            { name: 'A', slug: 'a', url: 'http://127.0.0.1:8080/category/a/' },
            { name: 'B', slug: 'b', url: 'http://127.0.0.1:8080/category/b/' },
          ]
        : [],
  });
  const noCats = content({ terms: () => [] });

  it.each([
    ['0 件', { term: 'category' }, noCats],
    ['2 件', { term: 'category' }, twoCats],
    ['separator 指定', { term: 'category', separator: ', ' }, oneCat()],
    ['className 指定', { term: 'category', className: 'x' }, oneCat()],
    ['未知キー', { term: 'category', foo: 1 }, oneCat()],
    ['term=post_format', { term: 'post_format' }, oneCat()],
    ['term=link_category', { term: 'link_category' }, oneCat()],
    ['term 未指定', {}, oneCat()],
    ['fontWeight bold', { term: 'category', style: { typography: { fontWeight: 'bold' } } }, oneCat()],
    ['fontWeight 350', { term: 'category', style: { typography: { fontWeight: '350' } } }, oneCat()],
    ['fontWeight 300;x:y', { term: 'category', style: { typography: { fontWeight: '300;x:y' } } }, oneCat()],
    ['style の他キー color', { term: 'category', style: { color: { text: 'red' } } }, oneCat()],
  ] as Array<[string, Record<string, unknown>, ContentPort]>)('%s は RangeError', (_label, attrs, c) => {
    expect(() => run(postTermsRenderer, 'core/post-terms', attrs, post(), c)).toThrow(RangeError);
  });
});

// ---- D3c2-03 post_tag ----
// Red 理由: termsAuthor.ts 未存在。
describe('D3c2-03 post-terms(post_tag)', () => {
  it('tags 0 件は空文字(single.html の実引数 separator/className 付きでも空文字)', () => {
    const attrs = { term: 'post_tag', separator: '  ', className: 'is-style-post-terms-1' };
    const c = content({ terms: () => [] });
    expect(run(postTermsRenderer, 'core/post-terms', attrs, post(), c)).toBe('');
  });

  it('tags が 1 件以上なら RangeError', () => {
    const c = content({
      terms: (tax) => (tax === 'post_tag' ? [{ name: 'x', slug: 'x', url: 'http://127.0.0.1:8080/tag/x/' }] : []),
    });
    expect(() => run(postTermsRenderer, 'core/post-terms', { term: 'post_tag' }, post(), c)).toThrow(RangeError);
  });
});

// ---- D3c2-04 エスケープ ----
// Red 理由: termsAuthor.ts 未存在。name/url の文字列が要素・属性を増やさないこと、URL は http/https のみを要求する。
describe('D3c2-04 エスケープと URL 検証(post-terms category)', () => {
  it.each([
    '<script>x</script>',
    'A & B',
    'say "hi"',
  ])('name %j は要素・属性を増やさずテキストとして出力される', (name) => {
    const c = content({
      terms: (tax) => (tax === 'category' ? [{ name, slug: 's', url: 'http://127.0.0.1:8080/category/s/' }] : []),
    });
    const out = run(postTermsRenderer, 'core/post-terms', { term: 'category' }, post(), c);
    const els = elements(out).map((e) => e.tagName);
    expect(els).toEqual(['div', 'a']);
    const a = elements(out).find((e) => e.tagName === 'a');
    expect(a?.attrs.map((x) => x.name).sort()).toEqual(['href', 'rel']);
    // テキストノードとして name がそのまま読めること(エスケープ済みの実テキストを DOM で検査)
    expect(textOf(out)).toBe(name);
  });

  it.each(['javascript:alert(1)', '//evil'])('url %s は RangeError', (url) => {
    const c = content({
      terms: (tax) => (tax === 'category' ? [{ name: 'N', slug: 's', url }] : []),
    });
    expect(() => run(postTermsRenderer, 'core/post-terms', { term: 'category' }, post(), c)).toThrow(RangeError);
  });

  it('url 内の " で属性が増えない(http/https の正当 URL でも属性注入されない)', () => {
    const url = 'http://127.0.0.1:8080/category/s/" onmouseover="alert(1)';
    const c = content({
      terms: (tax) => (tax === 'category' ? [{ name: 'N', slug: 's', url }] : []),
    });
    const out = run(postTermsRenderer, 'core/post-terms', { term: 'category' }, post(), c);
    const a = elements(out).find((e) => e.tagName === 'a');
    expect(a?.attrs.map((x) => x.name).sort()).toEqual(['href', 'rel']);
  });
});

// ---- D3c2-05 post-author-name ----
// Red 理由: termsAuthor.ts 未存在。
describe('D3c2-05 post-author-name', () => {
  it('author が null なら空文字', () => {
    const c = content({ author: () => null });
    expect(run(postAuthorNameRenderer, 'core/post-author-name', { isLink: true }, post(), c)).toBe('');
  });

  it('author {admin} の出力が set-main2/main.author-real.html の post-author-name 行と一致する', () => {
    const m = fixtureMatch(
      'set-main2/main.author-real.html',
      /<div class="wp-block-post-author-name">[\s\S]*?<\/div>/,
    );
    const c = content({ author: () => ({ name: 'admin', url: 'http://127.0.0.1:8080/author/admin/' }) });
    const out = run(postAuthorNameRenderer, 'core/post-author-name', { isLink: true }, post(), c);
    expect(htmlEquals(out, m[0])).toBe(true);
  });

  it.each([
    ['isLink 省略', {}],
    ['isLink false', { isLink: false }],
    ['未知キー textAlign', { isLink: true, textAlign: 'left' }],
  ] as Array<[string, Record<string, unknown>]>)('%s は RangeError', (_label, attrs) => {
    const c = content({ author: () => ({ name: 'admin', url: 'http://127.0.0.1:8080/author/admin/' }) });
    expect(() => run(postAuthorNameRenderer, 'core/post-author-name', attrs, post(), c)).toThrow(RangeError);
  });

  it('name の <script> はテキストとしてエスケープされ要素を増やさない', () => {
    const c = content({ author: () => ({ name: '<script>x</script>', url: 'http://127.0.0.1:8080/author/x/' }) });
    const out = run(postAuthorNameRenderer, 'core/post-author-name', { isLink: true }, post(), c);
    expect(elements(out).map((e) => e.tagName)).toEqual(['div', 'a']);
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('url が javascript: なら RangeError', () => {
    const c = content({ author: () => ({ name: 'admin', url: 'javascript:alert(1)' }) });
    expect(() => run(postAuthorNameRenderer, 'core/post-author-name', { isLink: true }, post(), c)).toThrow(RangeError);
  });
});

// ---- D3c2-06 post-featured-image ----
// Red 理由: termsAuthor.ts 未存在。
describe('D3c2-06 post-featured-image', () => {
  it('hasThumbnail false なら空文字(single.html の実引数 aspectRatio 3/2)', () => {
    const c = content({ hasThumbnail: () => false });
    expect(run(postFeaturedImageRenderer, 'core/post-featured-image', { aspectRatio: '3/2' }, post(), c)).toBe('');
  });

  it('hasThumbnail true なら RangeError(本 STEP では画像出力を実装しない)', () => {
    const c = content({ hasThumbnail: () => true });
    expect(() => run(postFeaturedImageRenderer, 'core/post-featured-image', { aspectRatio: '3/2' }, post(), c)).toThrow(RangeError);
  });

  it.each([
    ['aspectRatio 3:2', { aspectRatio: '3:2' }],
    ['aspectRatio a/b', { aspectRatio: 'a/b' }],
    ['未知キー sizeSlug', { sizeSlug: 'large' }],
  ] as Array<[string, Record<string, unknown>]>)('%s は RangeError', (_label, attrs) => {
    const c = content({ hasThumbnail: () => false });
    expect(() => run(postFeaturedImageRenderer, 'core/post-featured-image', attrs, post(), c)).toThrow(RangeError);
  });
});

// ---- D3c2-07 共通(post/content 欠落・innerBlocks・呼び出し回数) ----
// Red 理由: termsAuthor.ts 未存在。
describe('D3c2-07 共通の検証', () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ['core/post-terms', 'core/post-terms', { term: 'post_tag' }],
    ['core/post-author-name', 'core/post-author-name', { isLink: true }],
    ['core/post-featured-image', 'core/post-featured-image', {}],
  ];
  const rendererOf = (name: string) =>
    name === 'core/post-terms'
      ? postTermsRenderer
      : name === 'core/post-author-name'
        ? postAuthorNameRenderer
        : postFeaturedImageRenderer;

  it.each(cases)('%s は ctx.post 欠落で RangeError', (name, _b, attrs) => {
    expect(() => run(rendererOf(name), name, attrs, undefined, content())).toThrow(RangeError);
  });

  it.each(cases)('%s は ctx.content 欠落で RangeError', (name, _b, attrs) => {
    expect(() => run(rendererOf(name), name, attrs, post(), undefined)).toThrow(RangeError);
  });

  it.each(cases)('%s は innerBlocks 非空で RangeError', (name, _b, attrs) => {
    const child = blk('core/paragraph', {});
    expect(() => run(rendererOf(name), name, attrs, post(), content(), [child])).toThrow(RangeError);
  });

  it('post-author-name は同じポートで 2 回描画しても同じ結果(描画は純粋)', () => {
    const c = content({ author: () => ({ name: 'admin', url: 'http://127.0.0.1:8080/author/admin/' }) });
    const attrs = { isLink: true };
    const r1 = run(postAuthorNameRenderer, 'core/post-author-name', attrs, post(), c);
    const r2 = run(postAuthorNameRenderer, 'core/post-author-name', attrs, post(), c);
    expect(r1).not.toBe('');
    expect(r2).toBe(r1);
  });
});

// D3c2 補強(STEP6 mutation 生存): style の型・typography の未知キー・term 未指定・separator/className の型・aspectRatio。
describe('termsAuthor 補強', () => {
  const t = (attrs: Record<string, unknown>) =>
    run(postTermsRenderer, 'core/post-terms', attrs, post(), content({ terms: () => [{ name: 'U', slug: 'u', url: 'http://127.0.0.1:8080/category/u/' }] }));
  it.each([['x'], [[]], [null], [1]])('D3c2-02: style=%j(オブジェクト以外)は RangeError', (style) => {
    expect(() => t({ term: 'category', style })).toThrow(RangeError);
  });
  it.each([['x'], [[]], [null], [1]])('D3c2-02: style.typography=%j(オブジェクト以外)は RangeError', (typography) => {
    expect(() => t({ term: 'category', style: { typography } })).toThrow(RangeError);
  });
  it('D3c2-02: typography の未知キー(fontSize, lineHeight)は RangeError', () => {
    expect(() => t({ term: 'category', style: { typography: { fontSize: '1rem' } } })).toThrow(RangeError);
    expect(() => t({ term: 'category', style: { typography: { fontWeight: '300', lineHeight: '1' } } })).toThrow(RangeError);
  });
  it.each([[undefined], ['tag'], ['Category'], [1], [null]])('D3c2-02: term=%j は RangeError', (term) => {
    expect(() => t(term === undefined ? {} : { term })).toThrow(RangeError);
  });
  it.each([[1], [null], [{}]])('D3c2-03: post_tag の separator=%j / className=%j は文字列以外なら RangeError', (v) => {
    const empty = (attrs: Record<string, unknown>) =>
      run(postTermsRenderer, 'core/post-terms', attrs, post(), content({ terms: () => [] }));
    expect(() => empty({ term: 'post_tag', separator: v })).toThrow(RangeError);
    expect(() => empty({ term: 'post_tag', className: v })).toThrow(RangeError);
  });
  it.each([['0/1'], ['3/0'], ['03/2'], ['3/2x'], ['-3/2'], [' 3/2']])('D3c2-06: aspectRatio=%j は RangeError', (aspectRatio) => {
    expect(() => run(postFeaturedImageRenderer, 'core/post-featured-image', { aspectRatio }, post(), content())).toThrow(RangeError);
  });
  it('D3c2-06: aspectRatio 3/2 と 16/9 は受理される(thumbnail なしで空文字)', () => {
    for (const aspectRatio of ['3/2', '16/9']) {
      expect(run(postFeaturedImageRenderer, 'core/post-featured-image', { aspectRatio }, post(), content())).toBe('');
    }
  });
});

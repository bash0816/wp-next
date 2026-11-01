// SPDX-License-Identifier: GPL-3.0-only
// D3a2 STEP4: headingBlock のテスト(実装は未作成。Red 確認が目的)。
// 期待値は fixtures/ref からの正規表現抽出のみ。実装出力を手で写さない。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { htmlEquals } from './normalizeDom.js';
import { headingRenderer } from './headingBlock.js';
import type { ParsedBlock } from './renderBlocks.js';
import type { RenderCtx } from './blockRegistry.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(FIXTURES, rel), 'utf8');
}

function fixtureMatch(rel: string, re: RegExp): RegExpExecArray {
  const m = re.exec(readFixture(rel));
  if (!m) throw new Error(`fixture pattern not found: ${rel} ${re}`);
  return m;
}

function blk(attrs: Record<string, unknown>, innerHTML: string): ParsedBlock {
  return { blockName: 'core/heading', attrs, innerBlocks: [], innerHTML, innerContent: [innerHTML] };
}

// core/heading は子要素を取らないため ctx は参照されない想定。
const ctx = {} as unknown as RenderCtx;

function run(attrs: Record<string, unknown>, innerHTML: string): string {
  headingRenderer.validateAttrs(attrs);
  return headingRenderer.render(blk(attrs, innerHTML), ctx, () => '');
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

describe('headingBlock (D3a2)', () => {
  // D3a2-01: main-02 の More posts 見出し。alignwide + fontSize + typography の出力順と class/style 生成を検証する。
  // Red理由: headingBlock.ts 未作成のため import 失敗。
  // Green時に落ちる場合: align の class 付与順、style の順序(font-style;font-weight;letter-spacing;text-transform)、fontSize の has-*-font-size。
  it('D3a2-01: more-posts 見出しが main-02.html の h2 と一致する', () => {
    // 期待値は fixture line 3 の h2 を正規表現で抽出する。テキストも fixture から取る。
    const m = fixtureMatch(
      'regions/main-02.html',
      /<h2 class="wp-block-heading alignwide has-small-font-size"[^>]*>([^<]*More posts[^<]*)<\/h2>/,
    );
    // ブロック属性は仕様書 D3a2-01 記載値(main-02 の見出しブロックのコメント属性に対応)。
    const attrs = {
      align: 'wide',
      style: { typography: { textTransform: 'uppercase', fontStyle: 'normal', fontWeight: '700', letterSpacing: '1.4px' } },
      fontSize: 'small',
    };
    const out = run(attrs, `<h2>${m[1]}</h2>`);
    expect(htmlEquals(out, m[0])).toBe(true);
  });

  // D3a2-02: main-01 の Comments 見出し。fontSize のみ指定。
  // Red理由: headingBlock.ts 未作成。
  // Green時に落ちる場合: alignwide なしで has-x-large-font-size だけが付くこと、style 属性を出さないこと。
  it('D3a2-02: comments 見出しが main-01.html の h2 と一致する', () => {
    const m = fixtureMatch(
      'regions/main-01.html',
      /<h2 class="wp-block-heading has-x-large-font-size">([^<]*Comments[^<]*)<\/h2>/,
    );
    const out = run({ fontSize: 'x-large' }, `<h2>${m[1]}</h2>`);
    expect(htmlEquals(out, m[0])).toBe(true);
  });

  // D3a2-03: 不正な入力構造と level の拒否。RangeError を期待する。
  // Red理由: 未作成のため import 失敗。Green時に落ちる場合: level 検証の抜け、innerHTML と level の不一致検出漏れ。
  it.each([
    ['level 不一致 (level=3 に h2)', { level: 3 }, '<h2>x</h2>'],
    ['非 h 構造 (p 要素)', { level: 2 }, '<p>x</p>'],
    ['空 innerHTML', { level: 2 }, ''],
  ])('D3a2-03: %s は RangeError', (_label, attrs, inner) => {
    const err = captureError(() => run(attrs, inner));
    expect(err).toBeInstanceOf(RangeError);
  });

  // D3a2-03 (続き): level の不正値。仕様は 1〜6 の整数のみ。
  it.each([
    ['level 7', 7],
    ['level 0', 0],
    ["level '2' (文字列)", '2'],
  ])('D3a2-03: %s は RangeError', (_label, level) => {
    const err = captureError(() => run({ level }, '<h2>x</h2>'));
    expect(err).toBeInstanceOf(RangeError);
  });

  // D3a2-04: 未対応属性と不正値の拒否。
  // Red理由: 未作成のため import 失敗。Green時に落ちる場合: 許可リスト外キーの素通し、slug/typography の値検証の抜け。
  it.each([
    ['textAlign', { textAlign: 'center' }],
    ['anchor', { anchor: 'a1' }],
    ['className', { className: 'is-x' }],
    ['textColor', { textColor: 'red' }],
    ['style.color', { style: { color: { text: '#fff' } } }],
  ])('D3a2-04: 未対応属性 %s は RangeError', (_label, extra) => {
    const err = captureError(() => run({ level: 2, ...extra }, '<h2>x</h2>'));
    expect(err).toBeInstanceOf(RangeError);
  });

  it.each([['Small'], ['a b'], ['"']])('D3a2-04: 不正 fontSize %j は RangeError', (fontSize) => {
    const err = captureError(() => run({ level: 2, fontSize }, '<h2>x</h2>'));
    expect(err).toBeInstanceOf(RangeError);
  });

  it.each([['url(x)'], ['1.4'], ['red;x:y']])(
    'D3a2-04: 不正 letterSpacing %j は RangeError',
    (letterSpacing) => {
      const err = captureError(() =>
        run({ level: 2, style: { typography: { letterSpacing } } }, '<h2>x</h2>'),
      );
      expect(err).toBeInstanceOf(RangeError);
    },
  );

  // D3a2-05: innerHTML のサニタイズ。D-2c (paragraph) と同じく、例外なく終了し危険要素・属性が消えること。
  // Red理由: 未作成のため import 失敗。Green時に落ちる場合: sanitizeHtml を通していない、script 要素や onclick/javascript: href が残る。
  it('D3a2-05: script・onclick・javascript: を除去し、例外なく終了する', () => {
    const dirty =
      '<h2>Hi <script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">link</a></h2>';
    let out = '';
    expect(() => {
      out = run({ level: 2 }, dirty);
    }).not.toThrow();
    const els = allElements(out);
    expect(els.some((e) => e.tagName === 'script')).toBe(false);
    expect(els.some((e) => e.tagName === 'h2')).toBe(true);
    for (const e of els) {
      expect(e.attrs.some((a) => a.name === 'onclick')).toBe(false);
      expect(e.attrs.some((a) => /^\s*javascript:/i.test(a.value))).toBe(false);
    }
    expect(out).toContain('Hi');
  });
});

// D3a2 補強(STEP6 mutation 生存): align・typography 各値・style の型・複数見出し・子ブロック。
describe('headingBlock 補強', () => {
  const H2 = '<h2 class="wp-block-heading">x</h2>';
  it.each([['left'], [''], [1], [null]])('D3a2-04: align=%j は RangeError', (align) => {
    expect(captureError(() => run({ align }, H2))).toBeInstanceOf(RangeError);
  });
  it.each([
    ['fontStyle', 'oblique'],
    ['fontStyle', 'normal;x:y'],
    ['fontWeight', '650'],
    ['fontWeight', 'heavy'],
    ['fontWeight', '700;x:y'],
    ['textTransform', 'UPPERCASE'],
    ['textTransform', 'uppercase;x:y'],
    ['textTransform', 1],
  ])('D3a2-04: typography.%s=%j は RangeError', (key, value) => {
    expect(captureError(() => run({ style: { typography: { [key]: value } } }, H2))).toBeInstanceOf(RangeError);
  });
  it('D3a2-04: 未対応の typography キー(lineHeight, color)は RangeError', () => {
    expect(captureError(() => run({ style: { typography: { lineHeight: '1.5' } } }, H2))).toBeInstanceOf(RangeError);
    expect(captureError(() => run({ style: { typography: { color: 'red' } } }, H2))).toBeInstanceOf(RangeError);
  });
  it.each([['x'], [[]], [null], [1]])('D3a2-04: style=%j(オブジェクト以外)は RangeError', (style) => {
    expect(captureError(() => run({ style }, H2))).toBeInstanceOf(RangeError);
  });
  it.each([['x'], [[]], [null], [1]])('D3a2-04: style.typography=%j(オブジェクト以外)は RangeError', (typography) => {
    expect(captureError(() => run({ style: { typography } }, H2))).toBeInstanceOf(RangeError);
  });
  it('D3a2-03: 複数の見出し・外殻の後ろの別要素・前の別要素は RangeError', () => {
    for (const html of ['<h2>a</h2><h2>b</h2>', '<h2>a</h2><p>b</p>', '<p>a</p><h2>b</h2>', '<h2>a</h2>text']) {
      expect(captureError(() => run({}, html)), html).toBeInstanceOf(RangeError);
    }
  });
  it('D3a2-03: innerBlocks を持つ heading は RangeError', () => {
    const b: ParsedBlock = { ...blk({}, H2), innerBlocks: [blk({}, H2)] };
    expect(captureError(() => headingRenderer.render(b, ctx, () => ''))).toBeInstanceOf(RangeError);
  });
});

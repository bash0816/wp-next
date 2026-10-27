// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractEntryContent, htmlEquals, normalizeHtml } from './normalizeDom.js';

const spikePage = readFileSync(
  new URL('../../../fixtures/ref/spike-blocks.html', import.meta.url),
  'utf8',
);
const set2Page = readFileSync(
  new URL('../../../fixtures/ref/set2/fixture-two-nested.html', import.meta.url),
  'utf8',
);

describe('normalizeDom: 無視する差は同値になる (docs/08-p0-spike.md §1)', () => {
  it('HTMLコメントの有無は同値', () => {
    expect(htmlEquals('<p>a<!-- memo --></p>', '<p>a</p>')).toBe(true);
  });

  it('属性の順序違いは同値', () => {
    expect(htmlEquals('<a href="/x" id="y">t</a>', '<a id="y" href="/x">t</a>')).toBe(true);
  });

  it('要素間の空白のみのテキストノード(改行・インデント)の違いは同値', () => {
    const pretty = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>';
    const compact = '<ul><li>a</li><li>b</li></ul>';
    expect(htmlEquals(pretty, compact)).toBe(true);
  });

  it('siteurl置換は http://127.0.0.1:8080 のみ。別オリジンのURLは不一致のまま(契約④)', () => {
    const spikeUrl = '<a href="http://127.0.0.1:8080/hello/">x</a>';
    const otherUrl = '<a href="http://localhost:3000/hello/">x</a>';
    expect(htmlEquals(spikeUrl, otherUrl)).toBe(false);
    expect(htmlEquals(spikeUrl, spikeUrl)).toBe(true);
  });

  it('siteurl(127.0.0.1:8080)は固定プレースホルダに正規化される(属性・テキスト)', () => {
    expect(normalizeHtml('<a href="http://127.0.0.1:8080/x/">http://127.0.0.1:8080/x/</a>')).toBe(
      normalizeHtml('<a href="{{SITEURL}}/x/">{{SITEURL}}/x/</a>'),
    );
    expect(normalizeHtml('<a href="http://127.0.0.1:8080/x/">t</a>')).toContain('{{SITEURL}}');
  });

  it('nonce(_wpnonce の値と data-wp-nonce の値)の違いは同値', () => {
    expect(
      htmlEquals(
        '<a href="/x?_wpnonce=abc123&amp;foo=1">x</a>',
        '<a href="/x?_wpnonce=def456&amp;foo=1">x</a>',
      ),
    ).toBe(true);
    expect(htmlEquals('<div data-wp-nonce="aaa">x</div>', '<div data-wp-nonce="bbb">x</div>')).toBe(
      true,
    );
  });

  it('?ver= の値の違いは同値', () => {
    expect(
      htmlEquals('<script src="/a.js?ver=6.5.1"></script>', '<script src="/a.js?ver=6.4.0"></script>'),
    ).toBe(true);
  });
});

describe('normalizeDom: 消してはいけない差は不一致になる', () => {
  it('テキストの1文字違いは不一致', () => {
    expect(htmlEquals('<p>hello</p>', '<p>hellO</p>')).toBe(false);
  });

  it('class属性値の違いは不一致', () => {
    expect(htmlEquals('<p class="a">x</p>', '<p class="b">x</p>')).toBe(false);
  });

  it('class の並び順違いは不一致(文字列として比較)', () => {
    expect(htmlEquals('<p class="a b">x</p>', '<p class="b a">x</p>')).toBe(false);
  });

  it('href の違いは不一致', () => {
    expect(htmlEquals('<a href="/a">x</a>', '<a href="/b">x</a>')).toBe(false);
  });

  it('子要素の順序違いは不一致', () => {
    expect(htmlEquals('<ul><li>a</li><li>b</li></ul>', '<ul><li>b</li><li>a</li></ul>')).toBe(false);
  });

  it('子要素の欠落は不一致', () => {
    expect(htmlEquals('<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li></ul>')).toBe(false);
  });

  it('子要素の二重化は不一致', () => {
    expect(htmlEquals('<ul><li>a</li></ul>', '<ul><li>a</li><li>a</li></ul>')).toBe(false);
  });

  it('タグ名の違いは不一致', () => {
    expect(htmlEquals('<p>x</p>', '<div>x</div>')).toBe(false);
  });

  it('テキスト内部の空白数の違いは不一致', () => {
    expect(htmlEquals('<p>a  b</p>', '<p>a b</p>')).toBe(false);
  });

  it('属性値の違い(alt)は不一致', () => {
    expect(htmlEquals('<img alt="x" src="/i.png">', '<img alt="y" src="/i.png">')).toBe(false);
  });
});

describe('normalizeHtml: 正規化結果は決定的', () => {
  it('同値の入力からは同一の文字列が得られ、再呼び出しでも同じ', () => {
    const a = '<p class="k" id="z">t<!-- c --></p>\n';
    const b = '<p id="z" class="k">t</p>';
    expect(normalizeHtml(a)).toBe(normalizeHtml(b));
    expect(normalizeHtml(a)).toBe(normalizeHtml(a));
  });
});

describe('不正入力', () => {
  it('空文字は例外にならず空に正規化される', () => {
    expect(() => normalizeHtml('')).not.toThrow();
    expect(normalizeHtml('')).toBe('');
    expect(htmlEquals('', '')).toBe(true);
    expect(htmlEquals('', '<p>x</p>')).toBe(false);
  });

  it('entry-content が無いHTMLでは extractEntryContent が Error を投げる', () => {
    expect(() => extractEntryContent('<html><body><div class="other">x</div></body></html>')).toThrow(
      Error,
    );
  });
});

describe('extractEntryContent: 最初の div.entry-content の innerHTML を返す', () => {
  it('複数あるうち最初の要素の innerHTML のみを返す', () => {
    const html =
      '<div class="entry-content alignfull"><p>A</p></div><div class="entry-content"><p>B</p></div>';
    expect(extractEntryContent(html)).toBe('<p>A</p>');
  });
});

describe('実fixture: spike-blocks.html と set2/fixture-two-nested.html', () => {
  const spikeEntry = extractEntryContent(spikePage);
  const set2Entry = extractEntryContent(set2Page);

  it('(a) 両方の entry-content が空でない', () => {
    expect(spikeEntry.trim().length).toBeGreaterThan(0);
    expect(set2Entry.trim().length).toBeGreaterThan(0);
  });

  it('(b) set2 の entry-content は <h3 で始まり 入れ子 を含む', () => {
    expect(set2Entry).toMatch(/^<h3/);
    expect(set2Entry).toContain('入れ子');
  });

  it('(c) spike-blocks の entry-content は wp-block-latest-posts を含む', () => {
    expect(spikeEntry).toContain('wp-block-latest-posts');
  });

  it('(d) normalizeHtml は例外を出さず、自己比較は true、別ページ同士の entry-content は false', () => {
    expect(() => normalizeHtml(spikeEntry)).not.toThrow();
    expect(() => normalizeHtml(set2Entry)).not.toThrow();
    expect(() => normalizeHtml(spikePage)).not.toThrow();
    expect(() => normalizeHtml(set2Page)).not.toThrow();

    expect(htmlEquals(spikeEntry, spikeEntry)).toBe(true);
    expect(htmlEquals(set2Entry, set2Entry)).toBe(true);
    expect(htmlEquals(spikePage, spikePage)).toBe(true);
    expect(htmlEquals(set2Page, set2Page)).toBe(true);

    expect(htmlEquals(spikeEntry, set2Entry)).toBe(false);
  });

  it('(e) 実entry-content の1文字置換は不一致(置換が実際に起きたことも確認)', () => {
    const spikeMutated = spikeEntry.replace('見出し 2', '見出し 3');
    expect(spikeMutated).not.toBe(spikeEntry);
    expect(htmlEquals(spikeEntry, spikeMutated)).toBe(false);

    const set2Mutated = set2Entry.replace('入れ子', '入れ虎');
    expect(set2Mutated).not.toBe(set2Entry);
    expect(htmlEquals(set2Entry, set2Mutated)).toBe(false);
  });

  it('実entry-content に同値の変形(コメント挿入・要素間改行挿入)を施しても同値', () => {
    const withComment = set2Entry.replace(/^<h3/, '<!-- note --><h3');
    expect(withComment).not.toBe(set2Entry);
    expect(htmlEquals(set2Entry, withComment)).toBe(true);

    const withNewlines = spikeEntry.replace(/></g, '>\n<');
    expect(withNewlines).not.toBe(spikeEntry);
    expect(htmlEquals(spikeEntry, withNewlines)).toBe(true);
  });
});

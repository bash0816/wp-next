// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { parseFragment } from 'parse5';
import { sanitizeTitleHtml } from './sanitizeHtml.js';

// parse5 で読み直した要素名の集合を返す(テキストノードは除く)
type ParsedNode = { nodeName: string; childNodes?: ParsedNode[]; content?: { childNodes: ParsedNode[] } };
function elementNames(html: string): Set<string> {
  const names = new Set<string>();
  const walk = (nodes: ParsedNode[]): void => {
    for (const n of nodes) {
      if (!n.nodeName.startsWith('#')) {
        names.add(n.nodeName);
      }
      const children = n.content ? n.content.childNodes : n.childNodes;
      if (children) {
        walk(children);
      }
    }
  };
  walk([parseFragment(html) as unknown as ParsedNode]);
  return names;
}

describe('sanitizeTitleHtml: 許可タグ', () => {
  // TT-01 検出対象: 許可タグ(b/i/em/strong/code/del/q/cite/strike)が要素として残るか
  it('TT-01 許可された装飾タグは要素のまま残る', () => {
    const input = '<b>a</b><i>b</i><em>c</em><strong>d</strong><code>e</code><del>f</del><q>g</q><cite>h</cite><strike>i</strike>';
    expect(sanitizeTitleHtml(input)).toBe(input);
  });

  // TT-02 検出対象: abbr / acronym の title 属性が残り、他の属性は除かれるか
  it('TT-02 abbr[title] と acronym[title] は title を残す', () => {
    expect(sanitizeTitleHtml('<abbr title="略称">A</abbr>')).toBe('<abbr title="略称">A</abbr>');
    expect(sanitizeTitleHtml('<acronym title="頭字語">X</acronym>')).toBe('<acronym title="頭字語">X</acronym>');
  });

  // TT-03 検出対象: blockquote の cite 属性が残るか
  it('TT-03 blockquote[cite] は cite を残す', () => {
    const input = '<blockquote cite="https://example.com/">引用</blockquote>';
    expect(sanitizeTitleHtml(input)).toBe(input);
  });

  // TT-04 検出対象: a の href と title が両方残るか
  it('TT-04 a[href,title] は href と title を残す', () => {
    const input = '<a href="https://example.com/" title="説明">リンク</a>';
    expect(sanitizeTitleHtml(input)).toBe(input);
  });
});

describe('sanitizeTitleHtml: 非許可タグ', () => {
  // TT-05 検出対象: 非許可タグ(span/h1/div)は外側だけ除去され、子テキストが残るか
  it('TT-05 非許可タグは除去され、テキストは残る', () => {
    expect(sanitizeTitleHtml('<span>x</span>')).toBe('x');
    expect(sanitizeTitleHtml('<h1>見出し</h1>')).toBe('見出し');
    expect(sanitizeTitleHtml('<div>d</div>')).toBe('d');
  });

  // TT-06 検出対象: script / style が中身ごと消えるか(テキストも残らないこと)
  it('TT-06 script と style は中身ごと除去される', () => {
    const out = sanitizeTitleHtml('a<script>alert(1)</script>b<style>p{color:red}</style>c');
    expect(out).toBe('abc');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('color');
  });

  // TT-07 検出対象: img / iframe / svg / object / link が要素として残らないか
  it('TT-07 img・iframe・svg・object・link は要素として残らない', () => {
    const inputs = [
      'x<img src="https://example.com/a.png">y',
      'x<iframe src="https://example.com/"></iframe>y',
      'x<svg><circle r="1"></circle></svg>y',
      'x<object data="https://example.com/o.swf"></object>y',
      'x<link rel="stylesheet" href="https://example.com/a.css">y',
    ];
    for (const input of inputs) {
      const out = sanitizeTitleHtml(input);
      const names = elementNames(out);
      for (const forbidden of ['img', 'iframe', 'svg', 'circle', 'object', 'link']) {
        expect(names.has(forbidden), `${forbidden} が残った: ${out}`).toBe(false);
      }
      expect(out).toBe('xy');
    }
  });
});

describe('sanitizeTitleHtml: 属性', () => {
  // TT-08 検出対象: onclick / style / class / id / data-* が除去され、許可属性だけ残るか
  it('TT-08 許可外の属性は除去される', () => {
    expect(sanitizeTitleHtml('<b onclick="x()" style="color:red" class="c" id="i" data-x="1">t</b>')).toBe(
      '<b>t</b>',
    );
    expect(sanitizeTitleHtml('<abbr title="t" onclick="x" class="c">A</abbr>')).toBe('<abbr title="t">A</abbr>');
  });

  // TT-09 検出対象: href の危険なスキーム・プロトコル相対・難読化が除去され、安全な URL は残るか
  it('TT-09 危険な href は除去され、安全な href は残る', () => {
    // 除去: href 属性だけが消え、リンクの文字は残る
    const dangerous = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//evil.example/',
      'java\tscript:alert(1)',
    ];
    for (const href of dangerous) {
      const out = sanitizeTitleHtml(`<a href="${href}">l</a>`);
      expect(out, `href=${JSON.stringify(href)}`).toBe('<a>l</a>');
    }
    // 残す: http(s)・mailto・/ 始まり・# 始まり
    const safe = ['https://example.com/', 'mailto:a@example.com', '/path/', '#section'];
    for (const href of safe) {
      const out = sanitizeTitleHtml(`<a href="${href}">l</a>`);
      expect(out, `href=${href}`).toBe(`<a href="${href}">l</a>`);
    }
  });
});

describe('sanitizeTitleHtml: 構造と例外', () => {
  // TT-10 検出対象: 入れ子の許可タグが入れ子のまま残るか
  it('TT-10 入れ子の許可タグは入れ子のまま残る', () => {
    expect(sanitizeTitleHtml('<b><i>x</i></b>')).toBe('<b><i>x</i></b>');
  });

  // TT-11 検出対象: 壊れた HTML で例外を投げず、テキストが失われないか
  it('TT-11 閉じタグ欠落・余剰の閉じタグ・未閉じ属性で例外を投げない', () => {
    expect(() => sanitizeTitleHtml('<b>unclosed')).not.toThrow();
    expect(() => sanitizeTitleHtml('</b>stray')).not.toThrow();
    expect(() => sanitizeTitleHtml('<a href="x')).not.toThrow();
    expect(sanitizeTitleHtml('<b>unclosed')).toBe('<b>unclosed</b>');
    expect(sanitizeTitleHtml('</b>stray')).toBe('stray');
  });

  // TT-12 検出対象: 空文字列を空文字列として返すか
  it('TT-12 空文字列は空文字列を返す', () => {
    expect(sanitizeTitleHtml('')).toBe('');
  });

  // TT-13 検出対象: タグのないテキストがそのまま残るか
  it('TT-13 テキストだけの入力はそのまま残る', () => {
    expect(sanitizeTitleHtml('plain text')).toBe('plain text');
  });

  // TT-14 検出対象: 実体参照がテキストとして扱われ、タグとして解釈されないか
  it('TT-14 &amp; と &lt; はテキストとして往復する', () => {
    expect(sanitizeTitleHtml('A &amp; B')).toBe('A &amp; B');
    // &lt;b&gt; は要素ではなく文字列 "<b>" のまま
    const out = sanitizeTitleHtml('&lt;b&gt;x&lt;/b&gt;');
    expect(out).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(elementNames(out).has('b')).toBe(false);
  });

  // TT-15 検出対象: 日本語テキストと許可タグの組み合わせが文字化けせず残るか
  it('TT-15 日本語テキストと許可タグが共存する', () => {
    const input = '公開の <b>新しい</b> 記事';
    expect(sanitizeTitleHtml(input)).toBe(input);
  });
});

describe('sanitizeTitleHtml: 追加テスト (mutation 検出)', () => {
  // TT-16 検出対象: a の許可属性に onclick が混入する変更(許可集合の拡大)。onclick は除去され href と title は残るか
  it('TT-16 a の onclick は除去され、href と title は残る', () => {
    expect(sanitizeTitleHtml('<a href="https://example.com/" onclick="x()" title="t">y</a>')).toBe(
      '<a href="https://example.com/" title="t">y</a>',
    );
  });

  // TT-17 検出対象: 許可属性を持たないタグ(b / em)が、属性を一切残さないか
  it('TT-17 b と em は onclick・style・class・id・data-* を全て除去する', () => {
    expect(sanitizeTitleHtml('<b onclick="x">x</b>')).toBe('<b>x</b>');
    expect(sanitizeTitleHtml('<em style="color:red" class="c" id="i" data-x="1">y</em>')).toBe('<em>y</em>');
  });

  // TT-18 検出対象: q の cite と del の datetime が許可集合から消える変更。安全な値は残り、危険な cite は除去されるか
  it('TT-18 q[cite] と del[datetime] は残り、javascript: の cite は除去される', () => {
    expect(sanitizeTitleHtml('<q cite="https://example.com/q">x</q>')).toBe('<q cite="https://example.com/q">x</q>');
    expect(sanitizeTitleHtml('<del datetime="2026-01-01T00:00:00+00:00">x</del>')).toBe(
      '<del datetime="2026-01-01T00:00:00+00:00">x</del>',
    );
    expect(sanitizeTitleHtml('<q cite="javascript:alert(1)">x</q>')).toBe('<q>x</q>');
  });

  // TT-19 検出対象: TITLE_URL_ATTRS から cite が外れ、cite の URL 検証が無効になる変更
  it('TT-19 blockquote と q の cite は危険な URL を除去される', () => {
    expect(sanitizeTitleHtml('<blockquote cite="javascript:alert(1)">x</blockquote>')).toBe(
      '<blockquote>x</blockquote>',
    );
    expect(sanitizeTitleHtml('<q cite="//evil.example/">x</q>')).toBe('<q>x</q>');
  });

  // TT-20 検出対象: 制御文字・空白の除去(java\tscript: 対策)が外れる変更。難読化された javascript: が全て除去されるか
  it('TT-20 制御文字・空白・実体参照で難読化した javascript: の href は除去される', () => {
    const obfuscated = [
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      ' javascript:alert(1)',
      '\u0001javascript:alert(1)',
      'jav&#x09;ascript:alert(1)',
    ];
    for (const href of obfuscated) {
      const out = sanitizeTitleHtml(`<a href="${href}">x</a>`);
      expect(out, `href=${JSON.stringify(href)}`).toBe('<a>x</a>');
      expect(out).not.toContain('javascript');
    }
  });

  // TT-21 検出対象: 前後に空白がある安全な URL の扱い。実装は判定時に空白を除いてから検証し、値は原文のまま残す。
  // 期待: 空白を含む https URL は許可される(除去しない)。値を trim する変更や、空白を含む URL を一律拒否する変更を検出する。
  it('TT-21 前後に空白がある https URL は原文のまま残る', () => {
    expect(sanitizeTitleHtml('<a href="  https://example.com/  ">x</a>')).toBe(
      '<a href="  https://example.com/  ">x</a>',
    );
  });

  // TT-22 検出対象: HTML コメントの除去(nodeName が '#' で始まるノードの破棄)。コメント内の文字列が出力に残らないか
  it('TT-22 HTML コメントは除去され、テキストだけが残る', () => {
    const out = sanitizeTitleHtml('a<!-- secret -->b');
    expect(out).toBe('ab');
    expect(out).not.toContain('secret');
  });

  // TT-23 検出対象: 壊れたコメント(<!-->)が例外を投げず、後続の許可タグが正しく残るか
  it('TT-23 壊れたコメント <!--> の後の許可タグは残る', () => {
    expect(() => sanitizeTitleHtml('<!--><b>x</b>')).not.toThrow();
    expect(sanitizeTitleHtml('<!--><b>x</b>')).toBe('<b>x</b>');
  });
});

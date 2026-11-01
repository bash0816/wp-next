// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ThemeResolveError,
  expandPatterns,
  resolveTemplatePart,
  type ThemeFiles,
} from './templateResolve.js';

const fixtureRoot = new URL('./__fixtures__/theme/', import.meta.url);
const realThemeRoot = new URL('../../../fixtures/ref/themes/twentytwentyfive/', import.meta.url);

function fsThemeFiles(root: URL): ThemeFiles {
  return {
    read(relPath: string) {
      const url = new URL(relPath, root);
      return existsSync(url) ? readFileSync(url, 'utf8') : undefined;
    },
  };
}

const theme = fsThemeFiles(fixtureRoot);
const realTheme = fsThemeFiles(realThemeRoot);

function readFixture(rel: string): string {
  return readFileSync(new URL(rel, fixtureRoot), 'utf8');
}

/** Returns the ThemeResolveError code thrown by fn, or a marker describing what happened instead. */
function errorCodeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof ThemeResolveError ? e.code : `not-ThemeResolveError: ${String(e)}`;
  }
  return 'no-error';
}

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const pattern = (slug: string): string => `<!-- wp:pattern {"slug":"${slug}"} /-->`;

// Derived from the fixture itself, not hardcoded: how many times header.php references fx/leaf.
const leafRefs = countOf(readFixture('patterns/header.php'), '"slug":"fx/leaf"');

describe('resolveTemplatePart', () => {
  it('returns the content of parts/<slug>.html', () => {
    expect(resolveTemplatePart(theme, 'header')).toBe(readFixture('parts/header.html'));
  });

  it('throws unknown-part for a nonexistent part', () => {
    expect(errorCodeOf(() => resolveTemplatePart(theme, 'nope'))).toBe('unknown-part');
  });

  it.each(['../header', 'parts/header', '..', 'header/..'])(
    'rejects slug %s with unknown-part',
    (slug) => {
      expect(errorCodeOf(() => resolveTemplatePart(theme, slug))).toBe('unknown-part');
    },
  );

  it('does not read any path containing .. for traversal slugs', () => {
    const reads: string[] = [];
    const spy: ThemeFiles = {
      read(p: string) {
        reads.push(p);
        return theme.read(p);
      },
    };
    errorCodeOf(() => resolveTemplatePart(spy, '../header'));
    expect(reads.filter((p) => p.includes('..'))).toEqual([]);
  });
});

describe('expandPatterns: pattern expansion', () => {
  it('expands a simple pattern and strips the leading PHP header comment block', () => {
    const out = expandPatterns(pattern('fx/leaf'), theme);
    expect(out).toContain('<p>leaf</p>');
    expect(out).not.toContain('wp:pattern');
    expect(out).not.toContain('<?php');
    expect(out).not.toContain('Title: Fixture leaf');
  });

  it('expands nested patterns inside a block group', () => {
    const out = expandPatterns(pattern('fx/header'), theme);
    expect(out).toContain('<div class="wp-block-group">');
    expect(out).not.toContain('wp:pattern');
    expect(out).not.toContain('<?php');
    expect(countOf(out, '<p>leaf</p>')).toBe(leafRefs);
  });

  it('expands the same pattern referenced twice as siblings without a cycle error', () => {
    expect(leafRefs).toBeGreaterThanOrEqual(2);
    const out = expandPatterns(pattern('fx/header'), theme);
    expect(out).not.toBe('');
    expect(countOf(out, '<p>leaf</p>')).toBe(leafRefs);
  });

  it('expands the parts/header.html part end to end', () => {
    const out = expandPatterns(resolveTemplatePart(theme, 'header'), theme);
    expect(out).not.toContain('wp:pattern');
    expect(countOf(out, '<p>leaf</p>')).toBe(leafRefs);
  });
});

describe('expandPatterns: cycles', () => {
  it('reports a self-reference as cycle', () => {
    expect(errorCodeOf(() => expandPatterns(pattern('fx/self'), theme))).toBe('cycle');
  });

  it('reports a mutual reference (A -> B -> A) as cycle', () => {
    expect(errorCodeOf(() => expandPatterns(pattern('fx/cyc-a'), theme))).toBe('cycle');
  });
});

describe('expandPatterns: PHP substitutions', () => {
  it('escapes HTML text from esc_html_e and esc_html__', () => {
    const out = expandPatterns(pattern('fx/esc-text'), theme);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('onmouseover="');
    expect(out).toContain('&amp;');
  });

  it('escapes attribute values from esc_attr_e and esc_attr__ so they cannot break out', () => {
    const out = expandPatterns(pattern('fx/esc-attr'), theme);
    const dataX = /data-x="([^"]*)"/.exec(out)?.[1];
    const dataY = /data-y="([^"]*)"/.exec(out)?.[1];

    // A raw `"` in the value would close data-x early, leaving onmouseover outside the attribute.
    expect(dataX).toBeDefined();
    expect(dataX).toContain('onmouseover');
    expect(dataX).not.toMatch(/[<>"']/);

    // Attribute escape must encode the apostrophe, `<`, `>`, `&` and `"` inside data-y.
    expect(dataY).toBeDefined();
    expect(dataY).not.toMatch(/[<>"']/);
    expect(dataY).toMatch(/it(&#0?39;|&apos;)s/);
    expect(dataY).toContain('&lt;b&gt;');
    expect(dataY).toContain('&amp;');
  });
});

describe('expandPatterns: unsupported PHP', () => {
  it.each([
    ['php-var', '<?php echo $x; ?>'],
    ['php-short', '<?= 1 ?>'],
    ['php-esc-url', "<?php echo esc_url(get_theme_file_uri('a.png')); ?>"],
    ['php-second', '<?php foo(); ?> after the header'],
  ])('rejects %s (%s) with unsupported-php', (name) => {
    expect(errorCodeOf(() => expandPatterns(pattern(`fx/${name}`), theme))).toBe('unsupported-php');
  });
});

describe('expandPatterns: invalid attributes and unknown patterns', () => {
  it('rejects malformed attribute JSON with invalid-attrs', () => {
    expect(errorCodeOf(() => expandPatterns('<!-- wp:pattern {"slug": } /-->', theme))).toBe(
      'invalid-attrs',
    );
  });

  it('rejects a non-string slug with invalid-attrs', () => {
    expect(
      errorCodeOf(() => expandPatterns('<!-- wp:pattern {"slug":5} /-->', theme)),
    ).toBe('invalid-attrs');
  });

  it.each(['leaf', 'a/b/c', '/leaf', 'fx/'])(
    'rejects slug %s, which is not ns/name form, with invalid-attrs',
    (slug) => {
      expect(errorCodeOf(() => expandPatterns(pattern(slug), theme))).toBe('invalid-attrs');
    },
  );

  it('reports unknown-pattern when the pattern file does not exist', () => {
    expect(errorCodeOf(() => expandPatterns(pattern('fx/missing'), theme))).toBe(
      'unknown-pattern',
    );
  });
});

describe('real theme regression: twentytwentyfive', () => {
  it('fixture precondition: reference header part and pattern exist', () => {
    expect(existsSync(new URL('parts/header.html', realThemeRoot))).toBe(true);
    expect(existsSync(new URL('patterns/header.php', realThemeRoot))).toBe(true);
  });

  it('expands the header part with no leftover wp:pattern or PHP', () => {
    const part = resolveTemplatePart(realTheme, 'header');
    expect(countOf(part, 'wp:pattern')).toBeGreaterThan(0);

    const out = expandPatterns(part, realTheme);
    expect(out).not.toContain('wp:pattern');
    expect(out).not.toContain('<?php');
    expect(out).not.toContain('<?');
    expect(out).toContain('<!-- wp:');
  });
});

/** Inline single-pattern theme (slug fx/neg -> patterns/neg.php) for negative cases. */
function inlinePattern(body: string): ThemeFiles {
  const src = `<?php\n/**\n * Title: Neg\n * Slug: fx/neg\n */\n\n?>\n${body}\n`;
  return { read: (relPath: string) => (relPath === 'patterns/neg.php' ? src : undefined) };
}

const printfUrl = (url: string): string =>
  `'<a href="' . esc_url( __( '${url}', 'fx' ) ) . '" rel="nofollow">X</a>'`;

describe('expandPatterns: esc_html_x / esc_attr_x (A)', () => {
  it('esc_html_x escapes the text argument and ignores the context argument', () => {
    const out = expandPatterns(pattern('fx/esc-x'), theme);
    expect(out).toContain('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('CTXMARK');
  });

  it('esc_attr_x escapes quotes in the attribute value and ignores the context argument', () => {
    const out = expandPatterns(pattern('fx/esc-x'), theme);
    expect(out).not.toContain('"onmouseover=');
    expect(out).toContain('data-x="&quot;onmouseover=&quot;alert(1)"');
    expect(out).not.toContain('CTXMARK');
  });
});

describe('expandPatterns: printf footer idiom (B)', () => {
  const expected = 'Designed with <a href="https://wordpress.org" rel="nofollow">WordPress</a>';

  it('expands the footer-shaped printf block to the expected line', () => {
    const out = expandPatterns(pattern('fx/footer-printf'), theme);
    expect(out).toContain(expected);
    expect(out).not.toContain('<?');
  });

  it('escapes the FMT text (a < in FMT becomes an entity)', () => {
    const body = `<?php printf( esc_html__( 'A<B %s', 'fx' ), '<a href="' . esc_url( __( 'https://example.com', 'fx' ) ) . '" rel="nofollow">X</a>' ); ?>`;
    const out = expandPatterns(pattern('fx/neg'), inlinePattern(body));
    expect(out).toContain('A&lt;B <a href="https://example.com" rel="nofollow">X</a>');
  });

  const negatives: Array<[string, string]> = [
    ['javascript: URL', `<?php printf( esc_html__( 'Go %s', 'fx' ), ${printfUrl('javascript:alert(1)')} ); ?>`],
    ['%s count 0', `<?php printf( esc_html__( 'No placeholder', 'fx' ), ${printfUrl('https://example.com')} ); ?>`],
    ['%s count 2', `<?php printf( esc_html__( '%s and %s', 'fx' ), ${printfUrl('https://example.com')} ); ?>`],
    ['LABEL contains a tag', `<?php printf( esc_html__( 'Go %s', 'fx' ), '<a href="' . esc_url( __( 'https://example.com', 'fx' ) ) . '" rel="nofollow"><b>X</b></a>' ); ?>`],
    ['second argument is a variable', `<?php printf( esc_html__( 'Go %s', 'fx' ), $x ); ?>`],
    ['second argument is a function call', `<?php printf( esc_html__( 'Go %s', 'fx' ), foo() ); ?>`],
    ['non-printf function (sprintf)', `<?php echo sprintf( esc_html__( 'Go %s', 'fx' ), ${printfUrl('https://example.com')} ); ?>`],
  ];
  it.each(negatives)('rejects %s as unsupported-php', (_name, body) => {
    expect(errorCodeOf(() => expandPatterns(pattern('fx/neg'), inlinePattern(body)))).toBe(
      'unsupported-php',
    );
  });
});

describe('expandPatterns: esc_url(get_template_directory_uri()) stays unsupported (C)', () => {
  it('rejects the call as unsupported-php', () => {
    const body = `<a href="<?php echo esc_url( get_template_directory_uri() ); ?>">x</a>`;
    expect(errorCodeOf(() => expandPatterns(pattern('fx/neg'), inlinePattern(body)))).toBe(
      'unsupported-php',
    );
  });
});

describe('real theme regression: twentytwentyfive footer printf', () => {
  it('expands the footer part with no leftover PHP and the reference Designed-with line', () => {
    const ref = readFileSync(
      new URL('../../../fixtures/ref/regions/footer.html', import.meta.url),
      'utf8',
    );
    const expected = ref.match(/Designed with <a [^>]*>[^<]*<\/a>/)?.[0];
    expect(expected).toBeDefined();

    const out = expandPatterns(resolveTemplatePart(realTheme, 'footer'), realTheme);
    expect(out).not.toContain('<?php');
    expect(out).not.toContain('<?');
    expect(out).toContain(expected as string);
  });
});

// ---------------------------------------------------------------------------
// D-3z2 / D-3z3 追記 (STEP4 テスト)
// 注: parseTemplate は未実装。既存 import 行は変更せず、追記部分の先頭で import する。
// ---------------------------------------------------------------------------
import { parseTemplate } from './templateResolve.js';

const TPL_HEADER = '<!-- wp:template-part {"slug":"header"} /-->';
const TPL_FOOTER = '<!-- wp:template-part {"slug":"footer"} /-->';
const TPL_MAIN =
  '<!-- wp:group {"tagName":"main"} -->\n<main class="wp-block-group"><!-- wp:post-title {"level":1} /--></main>\n<!-- /wp:group -->';

/** templates/<name>.html だけを持つ ThemeFiles */
function inlineTemplate(name: string, html: string): ThemeFiles {
  return { read: (relPath: string) => (relPath === `templates/${name}.html` ? html : undefined) };
}

const withParts = (...lines: string[]): string => lines.join('\n');

describe('D3z2 parseTemplate: real twentytwentyfive single', () => {
  // test_id: D3z2-01
  // 検出対象: header/footer slug の取り出し、main に template-part を残さない、main の trim
  // 出典: fixtures/ref/themes/twentytwentyfive/templates/single.html (1行目 header, 25行目 footer, 2行目 wp:group tagName main)
  // 予測: Red (parseTemplate is not a function = 機能不足)
  it('D3z2-01 splits header/footer slugs and keeps main without template-part', () => {
    const parts = parseTemplate(realTheme, 'single');
    expect(parts.header).toBe('header');
    expect(parts.footer).toBe('footer');
    expect(parts.main).toContain('wp:group {"tagName":"main"');
    expect(parts.main).not.toContain('wp:template-part');
    expect(parts.main.startsWith('<!-- wp:group {"tagName":"main"')).toBe(true);
    expect(parts.main).not.toMatch(/^\s/);
    expect(parts.main).not.toMatch(/\s$/);
  });
});

describe('D3z2 parseTemplate: slugs follow the input', () => {
  // test_id: D3z2-02
  // 検出対象: header/footer を固定値で返す実装 (ハードコード) の検出
  // 予測: Red (parseTemplate is not a function)
  it('D3z2-02 returns the slugs written in the template, not hardcoded ones', () => {
    const html = withParts(
      '<!-- wp:template-part {"slug":"header-large-title"} /-->',
      TPL_MAIN,
      '<!-- wp:template-part {"slug":"footer-columns"} /-->',
    );
    const parts = parseTemplate(inlineTemplate('custom', html), 'custom');
    expect(parts.header).toBe('header-large-title');
    expect(parts.footer).toBe('footer-columns');
    expect(parts.main).toContain('<main class="wp-block-group">');
    expect(parts.main).not.toContain('wp:template-part');
  });
});

describe('D3z2 parseTemplate: rejection table', () => {
  const valid = withParts(TPL_HEADER, TPL_MAIN, TPL_FOOTER);
  // 各行: [label, テンプレート名, テンプレート HTML, 期待 code]
  // 予測: 全行 Red (parseTemplate is not a function -> 'not-ThemeResolveError: TypeError ...')
  // unknown-template 系: 欠落・不正名 (name は ^[a-z0-9-]+$ で検証、ファイル無しも unknown-template)
  // invalid-attrs 系: template-part の個数、位置、属性、slug、自己閉じ、JSON、main 内ネスト
  //   (main 内ネストは個数ルールでも拒否されるため、ネスト専用の検出ではなく両ルールの合算での拒否)
  it.each<[string, string, string, string]>([
    ['missing template file', 'missing', valid, 'unknown-template'],
    ['path traversal name', '../t', valid, 'unknown-template'],
    ['uppercase name', 'A', valid, 'unknown-template'],
    ['empty name', '', valid, 'unknown-template'],
    ['zero template-parts', 't', TPL_MAIN, 'invalid-attrs'],
    ['header only (1 part)', 't', withParts(TPL_HEADER, TPL_MAIN), 'invalid-attrs'],
    ['three parts', 't', withParts(TPL_HEADER, TPL_MAIN, TPL_FOOTER, TPL_FOOTER), 'invalid-attrs'],
    ['order swapped (footer first)', 't', withParts(TPL_FOOTER, TPL_MAIN, TPL_HEADER), 'invalid-attrs'],
    ['header not at head', 't', withParts(TPL_MAIN, TPL_HEADER, TPL_FOOTER), 'invalid-attrs'],
    [
      'footer not at tail (content follows)',
      't',
      withParts(TPL_HEADER, TPL_MAIN, TPL_FOOTER, '<!-- wp:post-title /-->'),
      'invalid-attrs',
    ],
    [
      'area attribute',
      't',
      withParts('<!-- wp:template-part {"slug":"header","area":"header"} /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'theme attribute',
      't',
      withParts('<!-- wp:template-part {"slug":"header","theme":"x"} /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'tagName attribute',
      't',
      withParts('<!-- wp:template-part {"slug":"header","tagName":"header"} /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'numeric slug',
      't',
      withParts('<!-- wp:template-part {"slug":1} /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'uppercase slug',
      't',
      withParts('<!-- wp:template-part {"slug":"Header"} /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'slash in slug',
      't',
      withParts('<!-- wp:template-part {"slug":"twentytwentyfive/header"} /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'non self-closing header',
      't',
      withParts(
        '<!-- wp:template-part {"slug":"header"} --><!-- /wp:template-part -->',
        TPL_MAIN,
        TPL_FOOTER,
      ),
      'invalid-attrs',
    ],
    [
      'invalid JSON attrs',
      't',
      withParts('<!-- wp:template-part {"slug":"header" /-->', TPL_MAIN, TPL_FOOTER),
      'invalid-attrs',
    ],
    [
      'nested template-part inside main',
      't',
      withParts(
        TPL_HEADER,
        '<!-- wp:group {"tagName":"main"} --><!-- wp:template-part {"slug":"x"} /--><!-- /wp:group -->',
        TPL_FOOTER,
      ),
      'invalid-attrs',
    ],
  ])('D3z2-03 rejects %s', (_label, name, html, code) => {
    expect(errorCodeOf(() => parseTemplate(inlineTemplate('t', html), name))).toBe(code);
  });
});

describe('D3z2 parseTemplate: main is consumable by expandPatterns', () => {
  // test_id: D3z2-04
  // 検出対象: main に残る wp:pattern が expandPatterns で展開できること (throw しない・Written by が出る)
  // 出典: single.html 9行目 wp:pattern hidden-written-by, patterns/hidden-written-by.php 内 esc_html_e('Written by ')
  // 予測: Red (parseTemplate is not a function)
  it('D3z2-04 expands the wp:pattern inside main from single.html', () => {
    const { main } = parseTemplate(realTheme, 'single');
    expect(main).toContain('<!-- wp:pattern {"slug":"twentytwentyfive/hidden-written-by"} /-->');
    let out = '';
    expect(() => {
      out = expandPatterns(main, realTheme);
    }).not.toThrow();
    expect(out).toContain('Written by');
    expect(out).not.toContain('wp:pattern {"slug":"twentytwentyfive/hidden-written-by"}');
    expect(out).not.toContain('<?php');
  });
});

describe('D3z3 regression guard: esc_attr_e expansion', () => {
  // test_id: D3z3-01 (回帰ガード)
  // 検出対象: post-navigation.php の JSON 属性内 esc_attr_e と HTML 属性内 esc_attr_e の両方の展開
  // 出典: fixtures/ref/themes/twentytwentyfive/patterns/post-navigation.php 4行目付近 ariaLabel / aria-label
  // 予測: Green (既存実装で展開済みの見込み。機能不足ではない回帰ガード)
  it('D3z3-01 expands esc_attr_e in JSON attr and HTML attr of post-navigation.php', () => {
    const src = realTheme.read('patterns/post-navigation.php') ?? '';
    expect(src).toContain(`"ariaLabel":"<?php esc_attr_e( 'Post navigation'`);
    expect(src).toContain(`aria-label="<?php esc_attr_e( 'Post navigation'`);
    const out = expandPatterns(pattern('twentytwentyfive/post-navigation'), realTheme);
    expect(out).toContain('"ariaLabel":"Post navigation"');
    expect(out).toContain('aria-label="Post navigation"');
    expect(out).not.toContain('<?php');
  });

  // test_id: D3z3-02 (回帰ガード)
  // 検出対象: JSON 内の esc_attr_e 展開結果が JSON.parse 可能で、" <> & が実体参照に退避されること。
  //   さらに既存挙動として \' は ' に解釈 (出力は &#039;)、\\ は \ に解釈 (esc_html_e の HTML 本文)。
  // 予測: Green (回帰ガード)
  it('D3z3-02 keeps JSON parseable and escapes quote/angle/amp inside esc_attr_e in JSON attrs', () => {
    const body = `<!-- wp:group {"ariaLabel":"<?php esc_attr_e( 'a"b', 'd' ); ?>","label":"<?php esc_attr_e( '<>&', 'd' ); ?>"} --><div></div><!-- /wp:group -->`;
    const out = expandPatterns(pattern('fx/neg'), inlinePattern(body));
    const m = /<!-- wp:group (\{[^\n]*?\}) -->/.exec(out);
    expect(m).not.toBeNull();
    const attrs = JSON.parse((m as RegExpExecArray)[1] ?? '{}') as { ariaLabel: string; label: string };
    expect(attrs.ariaLabel).toBe('a&quot;b');
    expect(attrs.label).toBe('&lt;&gt;&amp;');
  });

  // test_id: D3z3-02b (回帰ガード, 既存挙動の固定)
  // 検出対象: PHP 単引用符の \' と \\ の解釈。' は &#039;、\ はそのまま。
  // 予測: Green (回帰ガード)
  it('D3z3-02b pins existing \\\' and \\\\ unescape behavior in esc_html_e bodies', () => {
    const body = String.raw`<p><?php esc_html_e( 'it\'s', 'd' ); ?></p><p><?php esc_html_e( 'x\\y', 'd' ); ?></p>`;
    const out = expandPatterns(pattern('fx/neg'), inlinePattern(body));
    expect(out).toContain('<p>it&#039;s</p>');
    expect(out).toContain('<p>x\\y</p>');
  });
});

describe('D3z3 regression guard: unsupported PHP is rejected, not silently dropped', () => {
  // test_id: D3z3-03 (回帰ガード)
  // 検出対象: 許可式以外の PHP が unsupported-php で拒否され、黙って消されないこと
  // 予測: Green (既存の translatePhpBlock / PHP_OPEN 検出で拒否される見込み)
  it.each<[string, string]>([
    ['_e without esc', `<?php _e( 'x', 'd' ); ?>`],
    ['bare echo statement', `<?php echo 'x'; ?>`],
    ['variable argument', `<?php esc_attr_e( $var, 'd' ); ?>`],
    ['concatenated argument', `<?php esc_attr_e( 'a' . 'b', 'd' ); ?>`],
    ['unclosed php tag', `<?php esc_attr_e( 'x', 'd' )`],
    ['two statements in one block', `<?php esc_attr_e( 'a', 'd' ); esc_attr_e( 'b', 'd' ); ?>`],
  ])('D3z3-03 rejects unsupported PHP (%s) as unsupported-php', (_label, php) => {
    expect(errorCodeOf(() => expandPatterns(pattern('fx/neg'), inlinePattern(`<p>${php}</p>`)))).toBe(
      'unsupported-php',
    );
  });
});

// D3z2-03 補強(STEP6 mutation 生存): 二重に守られている規則を単独で検出する。
describe('D3z2 補強: 単独規則の検出', () => {
  const T = (header: string, footer: string): string =>
    [`<!-- wp:template-part {"slug":"${header}"} /-->`, TPL_MAIN, `<!-- wp:template-part {"slug":"${footer}"} /-->`].join('\n');

  // 役割 slug: footer 側は正しくても header 側が header を含まない(逆も)。位置・個数は正しい。
  it.each([
    ['first slug lacks header', T('sidebar', 'footer')],
    ['last slug lacks footer', T('header', 'sidebar')],
  ])('D3z2-05 %s は invalid-attrs', (_label, html) => {
    expect(errorCodeOf(() => parseTemplate(inlineTemplate('t', html), 't'))).toBe('invalid-attrs');
  });

  it('D3z2-05 TT25 の実在 slug(header-large-title / vertical-header / footer-columns)は受理される', () => {
    expect(parseTemplate(inlineTemplate('t', T('vertical-header', 'footer-columns')), 't')).toMatchObject({
      header: 'vertical-header',
      footer: 'footer-columns',
    });
  });

  // 非自己閉じ: 開始だけ(閉じなし)/ 閉じコメントだけが残る、をそれぞれ単独で検出する。
  it('D3z2-06 開始が非自己閉じ(閉じコメントなし)は invalid-attrs', () => {
    const html = ['<!-- wp:template-part {"slug":"header"} -->', TPL_MAIN, TPL_FOOTER].join('\n');
    expect(errorCodeOf(() => parseTemplate(inlineTemplate('t', html), 't'))).toBe('invalid-attrs');
  });
  it('D3z2-06 自己閉じの後ろに閉じコメントだけが残るのは invalid-attrs', () => {
    const html = [TPL_HEADER, TPL_MAIN, TPL_FOOTER, '<!-- /wp:template-part -->'].join('\n');
    expect(errorCodeOf(() => parseTemplate(inlineTemplate('t', html), 't'))).toBe('invalid-attrs');
  });

  // 不正な名前では読み取りを行わない(パス走査の防止)。
  it('D3z2-07 不正な名前では theme.read を呼ばない', () => {
    const reads: string[] = [];
    const theme: ThemeFiles = {
      read: (p) => {
        reads.push(p);
        return [TPL_HEADER, TPL_MAIN, TPL_FOOTER].join('\n');
      },
    };
    expect(errorCodeOf(() => parseTemplate(theme, '../t'))).toBe('unknown-template');
    expect(errorCodeOf(() => parseTemplate(theme, 'A'))).toBe('unknown-template');
    expect(reads).toEqual([]);
  });
});

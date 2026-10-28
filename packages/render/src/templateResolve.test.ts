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

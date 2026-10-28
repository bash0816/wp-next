// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { describe, expect, it } from 'vitest';
import { containerClassName } from './layoutClass.js';
import { globalConfigFromThemeJson, layoutHashInput } from './layoutInput.js';
import type { GlobalConfig } from './layoutInput.js';
import { expandPatterns, resolveTemplatePart } from './templateResolve.js';
import type { ThemeFiles } from './templateResolve.js';

// 期待値は fixtures/ref（実データ）から導出する。ここに値をハードコードしない。
const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');

function readFixture(rel: string): string {
  return readFileSync(join(FIXTURES, rel), 'utf8');
}

const realTheme: ThemeFiles = {
  read(relPath: string): string | undefined {
    const p = join(THEME_DIR, relPath);
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  },
};

interface ParsedBlock {
  blockName: string | null;
  attrs: Record<string, unknown>;
  innerBlocks: ParsedBlock[];
}

interface LayoutBlock {
  name: string;
  attrs: Record<string, unknown>;
}

// coverage 対象: attrs.layout がある、または block default を持つブロック（core/columns は属性なしでも対象）
function collectLayoutBlocks(
  blocks: ParsedBlock[],
  cfg: GlobalConfig,
  out: LayoutBlock[] = [],
): LayoutBlock[] {
  for (const b of blocks) {
    if (
      b.blockName &&
      (b.attrs?.layout !== undefined || Object.hasOwn(cfg.blockLayoutDefaults, b.blockName))
    ) {
      out.push({ name: b.blockName, attrs: b.attrs ?? {} });
    }
    collectLayoutBlocks(b.innerBlocks ?? [], cfg, out);
  }
  return out;
}

const CONTAINER_RE = /^wp-container-[a-z0-9-]+-is-layout-[0-9a-f]{8}$/;

function classAttrTokens(html: string): string[] {
  return [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/));
}

function containerClassesInOrder(html: string): string[] {
  return classAttrTokens(html).filter((c) => CONTAINER_RE.test(c));
}

// theme.json を JSON.parse で読む（固定値を使わない）
const themeJson: unknown = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
// ブロック型の既定 layout（基準WPの block.json から機械抽出済み）。テーマの settings.layout は使わない。
const blockLayoutDefaults: Record<string, Record<string, unknown>> = JSON.parse(
  readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

describe('composition: twentytwentyfive の header / footer / single.html から layout ブロックを集める', () => {
  it('header part (expandPatterns 後) に layout 付きブロックがある', () => {
    const markup = expandPatterns(resolveTemplatePart(realTheme, 'header'), realTheme);
    expect(collectLayoutBlocks(parse(markup) as ParsedBlock[], cfg).length).toBeGreaterThan(0);
  });

  it('footer part (expandPatterns 後) に layout 付きブロックがある', () => {
    const markup = expandPatterns(resolveTemplatePart(realTheme, 'footer'), realTheme);
    expect(collectLayoutBlocks(parse(markup) as ParsedBlock[], cfg).length).toBeGreaterThan(0);
  });

  it('templates/single.html (expandPatterns 後) に layout 付きブロックがある', () => {
    const raw = realTheme.read('templates/single.html');
    expect(raw, 'templates/single.html が読めること').toBeDefined();
    const markup = expandPatterns(raw ?? '', realTheme);
    expect(collectLayoutBlocks(parse(markup) as ParsedBlock[], cfg).length).toBeGreaterThan(0);
  });
});

describe('coverage: 計算クラスが spike-blocks.html の参照クラスを覆う', () => {
  const sources = ['header', 'footer'].map((slug) =>
    expandPatterns(resolveTemplatePart(realTheme, slug), realTheme),
  );
  sources.push(expandPatterns(realTheme.read('templates/single.html') ?? '', realTheme));

  const computedBlocks = sources.flatMap((m) => collectLayoutBlocks(parse(m) as ParsedBlock[], cfg));
  const computed = new Set(
    computedBlocks.map((b) => containerClassName(b.name, layoutHashInput(b, cfg))),
  );

  const reference = new Set(containerClassesInOrder(readFixture('spike-blocks.html')));

  it('参照クラスが 1 件以上抽出できる（class 属性由来）', () => {
    expect(reference.size).toBeGreaterThan(0);
  });

  it('参照クラスはすべて計算結果に含まれる（欠落を列挙）', () => {
    const missing = [...reference].filter((c) => !computed.has(c));
    expect(missing, `計算結果に無い参照クラス: ${missing.join(', ')}`).toEqual([]);
  });

  it('参照のみ（情報用・失敗にしない）: 計算結果のうち参照に無いクラス数を出力', () => {
    const extra = [...computed].filter((c) => !reference.has(c));
    console.info(`[info] computed classes absent from reference: ${extra.length}`);
    expect(extra.length).toBeGreaterThanOrEqual(0);
  });
});

describe('globalConfigFromThemeJson', () => {
  it('theme.json から hasBlockGapSupport=true と globalBlockGap="1.2rem" を読む', () => {
    const json = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8')) as {
      styles?: { spacing?: { blockGap?: unknown } };
    };
    const expectedGap = json.styles?.spacing?.blockGap;
    const parsed = globalConfigFromThemeJson(json, blockLayoutDefaults);
    expect(parsed.hasBlockGapSupport).toBe(true);
    expect(parsed.globalBlockGap).toBe(expectedGap);
    expect(parsed.globalBlockGap).toBe('1.2rem');
    expect(parsed.blockLayoutDefaults['core/columns']).toEqual(blockLayoutDefaults['core/columns']);
  });
});

describe('既知値: regions/header.html の class 属性と照合', () => {
  // ブロックマークアップはテーマの parts/header.html を展開して取る（regions/header.html はブロックコメントを持たない）
  const headerHtml = readFixture('regions/header.html');
  const headerMarkup = expandPatterns(resolveTemplatePart(realTheme, 'header'), realTheme);
  const headerBlocks = collectLayoutBlocks(parse(headerMarkup) as ParsedBlock[], cfg);
  const htmlClasses = containerClassesInOrder(headerHtml);

  // WP は layout CSS が空のブロックにクラスを付けないため、HTML のクラス列は計算クラス列の部分列になる（順序保持）
  const computedInDocOrder = headerBlocks.map((b) =>
    containerClassName(b.name, layoutHashInput(b, cfg)),
  );

  it('HTML のクラス列（文書順）は計算クラス列の部分列である', () => {
    expect(htmlClasses.length).toBeGreaterThan(0);
    let i = 0;
    for (const c of computedInDocOrder) {
      if (i < htmlClasses.length && c === htmlClasses[i]) i++;
    }
    expect(
      i,
      `HTML の ${htmlClasses.length} 件中 ${i} 件だけが計算列に順序保持で現れた`,
    ).toBe(htmlClasses.length);
  });

  it('既知ハッシュ（ec1e7a1e, fbffc046, 6e943505）が計算クラス集合に含まれる', () => {
    const computedHashes = new Set(computedInDocOrder.map((c) => c.slice(-8)));
    for (const h of ['ec1e7a1e', 'fbffc046', '6e943505']) {
      expect(computedHashes.has(h), `計算結果にハッシュ ${h} が無い`).toBe(true);
    }
  });
});

describe('fallback gap: プリセット参照の解決（グローバルスタイル由来）', () => {
  const columnsGap = (
    themeJson as { styles?: { blocks?: Record<string, { spacing?: { blockGap?: unknown } }> } }
  ).styles?.blocks?.['core/columns']?.spacing?.blockGap;

  it('theme.json の core/columns blockGap は preset 参照 var:preset|spacing|50 である（前提）', () => {
    expect(columnsGap).toBe('var:preset|spacing|50');
  });

  it('preset 参照は var(--wp--preset--<type>--<slug>) に解決されて第5要素に入る', () => {
    const cfg2: GlobalConfig = { ...cfg, blockGapByBlock: { 'core/columns': 'var:preset|spacing|50' } };
    const out = layoutHashInput({ name: 'core/columns', attrs: {} }, cfg2);
    expect(out[4]).toBe('var(--wp--preset--spacing--50)');
  });

  it('globalBlockGap="1.2rem" はそのまま第5要素に入る', () => {
    const cfg2: GlobalConfig = { ...cfg, blockGapByBlock: {}, globalBlockGap: '1.2rem' };
    const out = layoutHashInput({ name: 'core/group', attrs: {} }, cfg2);
    expect(out[4]).toBe('1.2rem');
  });

  it('プリセット形式でない文字列はそのまま第5要素に入る', () => {
    const cfg2: GlobalConfig = { ...cfg, blockGapByBlock: { 'core/columns': '2rem' } };
    const out = layoutHashInput({ name: 'core/columns', attrs: {} }, cfg2);
    expect(out[4]).toBe('2rem');
  });

  it('不正形式の preset 参照（var:preset|spacing）は RangeError（fail-closed）', () => {
    const cfg2: GlobalConfig = { ...cfg, blockGapByBlock: { 'core/columns': 'var:preset|spacing' } };
    expect(() => layoutHashInput({ name: 'core/columns', attrs: {} }, cfg2)).toThrow(RangeError);
  });

  it('属性由来の blockGap は第3要素に raw のまま入る（解決しない）', () => {
    const block = {
      name: 'core/group',
      attrs: { layout: { type: 'flex' }, style: { spacing: { blockGap: 'var:preset|spacing|10' } } },
    };
    const out = layoutHashInput(block, cfg);
    expect(out[2]).toBe('var:preset|spacing|10');
  });
});

describe('出力形状', () => {
  const headerMarkup = expandPatterns(resolveTemplatePart(realTheme, 'header'), realTheme);
  const first = collectLayoutBlocks(parse(headerMarkup) as ParsedBlock[], cfg)[0];

  it('要素数は 6', () => {
    expect(first).toBeDefined();
    expect(layoutHashInput(first!, cfg)).toHaveLength(6);
  });

  it('要素 2 と 4 は boolean', () => {
    const out = layoutHashInput(first!, cfg);
    expect(typeof out[1]).toBe('boolean');
    expect(typeof out[3]).toBe('boolean');
  });

  it('要素 0 は attrs.layout と同じキー順（attrs の挿入順）', () => {
    const out = layoutHashInput(first!, cfg);
    const layout = first!.attrs.layout as Record<string, unknown>;
    expect(Object.keys(out[0] as Record<string, unknown>)).toEqual(Object.keys(layout));
    expect(JSON.stringify(out[0])).toBe(JSON.stringify(layout));
  });

  it('要素 4 は fallback gap（global styles 由来）', () => {
    const out = layoutHashInput(first!, cfg);
    expect(out[4]).toBe(cfg.globalBlockGap);
  });
});

describe('負のケース', () => {
  it('attrs.layout が無いとブロック型の既定（layout-defaults.json）を used_layout に使う', () => {
    const out = layoutHashInput({ name: 'core/columns', attrs: {} }, cfg);
    expect(out[0]).toEqual(blockLayoutDefaults['core/columns']);
  });

  it('attrs.layout も block default も無いブロックは第1要素が空配列', () => {
    const out = layoutHashInput({ name: 'test/no-default', attrs: {} }, cfg);
    expect(out[0]).toEqual([]);
  });

  it('blockGap が number など不正な型だと RangeError（fail-closed）', () => {
    const block = {
      name: 'core/group',
      attrs: {
        layout: { type: 'flex' },
        style: { spacing: { blockGap: 5 } },
      },
    };
    expect(() => layoutHashInput(block, cfg)).toThrow(RangeError);
  });
});

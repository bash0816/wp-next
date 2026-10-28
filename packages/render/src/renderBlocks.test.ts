// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFragment, serialize } from 'parse5';
import { extractEntryContent, htmlEquals } from './normalizeDom.js';
import { renderBlocks, UnsupportedBlockError } from './renderBlocks.js';

const setTwoPost = readFileSync(
  new URL('../../../fixtures/ref/set2/fixture-two-nested.post_content.html', import.meta.url),
  'utf8',
);
const setTwoRef = readFileSync(
  new URL('../../../fixtures/ref/set2/fixture-two-nested.html', import.meta.url),
  'utf8',
);
const spikePost = readFileSync(
  new URL('../../../fixtures/ref/spike-blocks.post_content.html', import.meta.url),
  'utf8',
);
const spikeRef = readFileSync(
  new URL('../../../fixtures/ref/spike-blocks.html', import.meta.url),
  'utf8',
);

type AnyNode = {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: AnyNode[];
};

/** entry-content 内の ul.wp-block-latest-posts__list を parse5 木から除去し、除去件数も返す */
function removeLatestPostsList(html: string): { html: string; removed: number } {
  const frag = parseFragment(html) as unknown as AnyNode & { childNodes: AnyNode[] };
  let removed = 0;
  const walk = (parent: { childNodes?: AnyNode[] }): void => {
    if (!parent.childNodes) {
      return;
    }
    parent.childNodes = parent.childNodes.filter((node) => {
      const classes = (node.attrs ?? [])
        .find((a) => a.name === 'class')
        ?.value.split(/\s+/) ?? [];
      if (node.nodeName === 'ul' && classes.includes('wp-block-latest-posts__list')) {
        removed += 1;
        return false;
      }
      walk(node);
      return true;
    });
  };
  walk(frag);
  return { html: serialize(frag as never), removed };
}

type RenderResult = { out?: string; err?: unknown };

function renderOrError(input: string): RenderResult {
  try {
    return { out: renderBlocks(input) };
  } catch (err) {
    return { err };
  }
}

describe('renderBlocks: 基準 fixture との一致', () => {
  it('set2 (入れ子の静的ブロック) は WP 生成の entry-content と完全一致する', () => {
    const out = renderBlocks(setTwoPost);
    const expected = extractEntryContent(setTwoRef);
    expect(expected.length).toBeGreaterThan(0);
    expect(htmlEquals(out, expected)).toBe(true);
  });

  it('spike-blocks から latest-posts 行を除くと、基準から latest-posts リストを除いた結果と一致する', () => {
    const lines = spikePost.split('\n');
    const kept = lines.filter((line) => !line.includes('<!-- wp:latest-posts'));
    expect(lines.length - kept.length).toBe(1);

    const out = renderBlocks(kept.join('\n'));

    const reference = removeLatestPostsList(extractEntryContent(spikeRef));
    expect(reference.removed).toBe(1);
    expect(htmlEquals(out, reference.html)).toBe(true);
  });
});

describe('renderBlocks: 動的ブロックの拒否 (fail-closed)', () => {
  it('spike-blocks の全 post_content (latest-posts 含む) は UnsupportedBlockError(core/latest-posts) を投げる', () => {
    const { out, err } = renderOrError(spikePost);
    expect(out).toBeUndefined();
    expect(err).toBeInstanceOf(UnsupportedBlockError);
    expect((err as UnsupportedBlockError).blockName).toBe('core/latest-posts');
  });

  it('未知ブロック acme/unknown は UnsupportedBlockError(acme/unknown) を投げ、生HTMLを返さない', () => {
    const input = '<!-- wp:acme/unknown --><div>x</div><!-- /wp:acme/unknown -->';
    const { out, err } = renderOrError(input);
    expect(out).toBeUndefined();
    expect(err).toBeInstanceOf(UnsupportedBlockError);
    expect((err as UnsupportedBlockError).blockName).toBe('acme/unknown');
  });

  it('閉じ忘れの壊れたブロックコメントは例外になるか、少なくとも生のブロックコメントを出力しない', () => {
    const broken = '<!-- wp:paragraph --><p>閉じ忘れ</p>';
    const { out, err } = renderOrError(broken);
    if (err !== undefined) {
      expect(err).toBeInstanceOf(Error);
    } else {
      expect(out).not.toMatch(/<!--\s*\/?wp:/);
    }
  });
});

describe('renderBlocks: 出力境界の安全', () => {
  it('paragraph の innerHTML に含まれる script を出力に残さない (サニタイズでも例外でもよい)', () => {
    const input =
      '<!-- wp:paragraph --><p>安全<script>alert(1)</script></p><!-- /wp:paragraph -->';
    const { out, err } = renderOrError(input);
    if (err !== undefined) {
      expect(err).toBeInstanceOf(Error);
    } else {
      expect(out).not.toMatch(/<script/i);
    }
  });
});

describe('renderBlocks: 入れ子と順序', () => {
  const input = [
    '<!-- wp:heading {"level":2} --><h2 class="wp-block-heading">見出し</h2><!-- /wp:heading -->',
    '<!-- wp:paragraph --><p>本文</p><!-- /wp:paragraph -->',
    '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>項目A</li><!-- /wp:list-item --><!-- wp:list-item --><li>項目B</li><!-- /wp:list-item --></ul><!-- /wp:list -->',
    '<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p>引用1</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>引用2</p><!-- /wp:paragraph --></blockquote><!-- /wp:quote -->',
  ].join('\n');

  // 期待値は基準WP 7.1.3 で apply_filters('the_content', input) を実行した実出力(2026-10-28 取得)。
  const expectedInOrder =
    '<h2 class="wp-block-heading">見出し</h2>' +
    '<p class="wp-block-paragraph">本文</p>' +
    '<ul class="wp-block-list"><li>項目A</li><li>項目B</li></ul>' +
    '<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow"><p class="wp-block-paragraph">引用1</p><p class="wp-block-paragraph">引用2</p></blockquote>';

  const expectedSwapped =
    '<h2 class="wp-block-heading">見出し</h2>' +
    '<p class="wp-block-paragraph">本文</p>' +
    '<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow"><p class="wp-block-paragraph">引用1</p><p class="wp-block-paragraph">引用2</p></blockquote>' +
    '<ul class="wp-block-list"><li>項目A</li><li>項目B</li></ul>';

  it('h2→p→ul(li×2)→quote(p×2) の要素順序が入力順と一致する', () => {
    const out = renderBlocks(input);
    expect(htmlEquals(out, expectedInOrder)).toBe(true);
    expect(htmlEquals(out, expectedSwapped)).toBe(false);
  });
});

describe('renderBlocks: 空入力', () => {
  it('空文字は例外にならず空白のみを返す', () => {
    expect(() => renderBlocks('')).not.toThrow();
    expect(renderBlocks('').trim()).toBe('');
  });

  it('空白のみの入力は空白のみを返す', () => {
    expect(() => renderBlocks('\n  \t\n')).not.toThrow();
    expect(renderBlocks('\n  \t\n').trim()).toBe('');
  });

  it('ブロックなしのコメントのみの入力は例外にならず空白のみを返す', () => {
    const { out, err } = renderOrError('<!-- メモ -->');
    expect(err).toBeUndefined();
    expect(out?.trim()).toBe('');
  });
});

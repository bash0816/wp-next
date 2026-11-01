// SPDX-License-Identifier: GPL-3.0-only
// D-3c2 STEP4-B: twentytwentyfive/hidden-written-by パターンのレンダリングと、
// core/post-terms・core/post-author-name・core/post-featured-image の登録のテスト。test_id は D3c2-10 〜。
// 期待値はすべて fixtures/ref の HTML から抽出する(ハードコードしない)。
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { openCurrentPost } from '@wpn/db';
import { openDumpDb, applyS3 } from '@wpn/db/testing';
import { describe, expect, it } from 'vitest';
import { type RenderCtx, renderTree } from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock } from './renderBlocks.js';
import { expandPatterns, type ThemeFiles } from './templateResolve.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');

const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

const realTheme: ThemeFiles = {
	read(relPath: string): string | undefined {
		const p = join(THEME_DIR, relPath);
		return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
	},
};

const HIDDEN_WRITTEN_BY = '<!-- wp:pattern {"slug":"twentytwentyfive/hidden-written-by"} /-->';
const WRITTEN_BY_START = '<div class="wp-block-group has-small-font-size';

function fixture(relPath: string): string {
	return readFileSync(join(FIXTURES, relPath), 'utf8');
}

// startMarker で始まる <div> を開始位置から、対応する </div> まで(深さカウント)で切り出す。
function extractDiv(html: string, startMarker: string): string {
	const start = html.indexOf(startMarker);
	if (start < 0) throw new Error(`marker not found: ${startMarker}`);
	const re = /<div\b|<\/div>/g;
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m !== null; m = re.exec(html)) {
		depth += m[0] === '</div>' ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	throw new Error(`unclosed div after marker: ${startMarker}`);
}

function renderHiddenWrittenBy(ctx: RenderCtx): string {
	const markup = expandPatterns(HIDDEN_WRITTEN_BY, realTheme);
	return renderTree(parse(markup) as unknown as ParsedBlock[], ctx, createThemeRegistry());
}

// S0 (openDumpDb のみ) / S3 (applyS3) の post 5 (spike-blocks) を使う ctx を作る。
function makeCtx(db: DatabaseSync): RenderCtx {
	const current = openCurrentPost(db, { slug: 'spike-blocks' });
	if (!current) throw new Error('spike-blocks post not found');
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
		post: current.post,
		content: current.content,
	} as unknown as RenderCtx;
}

describe('D3c2-10: hidden-written-by を S0 で描画すると main-01 の written-by group と一致する', () => {
	// D3c2-10 (Red予測): パターン・fontSize 未実装のため group 部分が一致しない。
	it('D3c2-10: S0 の描画結果が main-01.html の written-by div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			const actual = renderHiddenWrittenBy(makeCtx(db));
			const expected = extractDiv(fixture('regions/main-01.html'), WRITTEN_BY_START);
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3c2-11: hidden-written-by を S3 で描画すると author-real の written-by group と一致する', () => {
	// D3c2-11 (Red予測): パターン・fontSize 未実装、加えて post-author-name の出力が未対応のため一致しない。
	it('D3c2-11: S3 の描画結果が main.author-real.html の written-by div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			applyS3(db);
			const actual = renderHiddenWrittenBy(makeCtx(db));
			const expected = extractDiv(fixture('set-main2/main.author-real.html'), WRITTEN_BY_START);
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3c2-12: createThemeRegistry の登録キー(D-3f で 28 件に更新)', () => {
	// D3c2-12 (Red予測): 現状 16 件のため、新規 3 キーが無く集合が一致しない。
	it('D3c2-12: keys() が 21 既存 + コメント系 7 の 28 キーと集合として一致する', () => {
		const expected = [
			'core/group',
			'core/site-title',
			'core/navigation',
			'core/page-list',
			'core/navigation-link',
			'core/site-logo',
			'core/site-tagline',
			'core/spacer',
			'core/columns',
			'core/column',
			'core/paragraph',
			'core/heading',
			'core/post-title',
			'core/post-date',
			'core/query',
			'core/post-template',
			'core/post-terms',
			'core/post-author-name',
			'core/post-featured-image',
			'core/post-content',
			'core/post-navigation-link',
			'core/comments',
			'core/comments-title',
			'core/comment-template',
			'core/comments-pagination',
			'core/comments-pagination-previous',
			'core/comments-pagination-next',
			'core/post-comments-form',
		].sort();
		const actual = [...createThemeRegistry().keys()].sort();
		expect(actual).toHaveLength(28);
		expect(actual).toEqual(expected);
	});
});

describe('D3c2-13: single.html の post-terms / post-featured-image が単独で空文字に描画される', () => {
	// D3c2-13 (Red予測): 両ブロックが未登録のため、描画時に例外または非空文字になる。
	it.each([
		['post-terms', '<!-- wp:post-terms {"term":"post_tag","separator":"  ","className":"is-style-post-terms-1"} /-->'],
		['post-featured-image', '<!-- wp:post-featured-image {"aspectRatio":"3/2"} /-->'],
	])('D3c2-13: %s が S0 post 5 で例外なく空文字になる', (_name, markup) => {
		const db = openDumpDb();
		try {
			const ctx = makeCtx(db);
			const out = renderTree(parse(markup) as unknown as ParsedBlock[], ctx, createThemeRegistry());
			expect(out).toBe('');
		} finally {
			db.close();
		}
	});
});

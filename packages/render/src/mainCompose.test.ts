// SPDX-License-Identifier: GPL-3.0-only
// D-3g STEP4: main template part の合成 (renderMain) のテスト。test_id は D3g-01 〜 D3g-09。
// 期待値はすべて fixtures/ref の HTML と dump.sql / DB 操作から取得する(ハードコードしない)。
// Red期待: mainCompose.ts は未存在のため、本ファイルの import が解決できず収集失敗になる。
// 各 test の Red 理由は実装前の観測結果ではなく、実装が無い時点での予測として併記する。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';
import { makeQueriesPort, openCurrentPost, UnsupportedDataError } from '@wpn/db';
import { openDumpDb, updateRow, applyS1, applyS2, applyS3 } from '@wpn/db/testing';
import { describe, expect, it } from 'vitest';
import type { RenderCtx } from './blockRegistry.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { renderMain, SKIP_LINK_TARGET_ID } from './mainCompose.js';
import { renderHeader } from './headerCompose.js';
import { renderFooter } from './footerCompose.js';
import { UnsupportedBlockError } from './renderBlocks.js';
import { ThemeResolveError, type ThemeFiles } from './templateResolve.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const SINGLE = 'templates/single.html';
const SKIP_ID_ATTR = `id="${SKIP_LINK_TARGET_ID}"`;

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

// 指定ファイルだけ差し替え、それ以外は実テーマを返す。
function themeWith(overrides: Record<string, string | undefined>): ThemeFiles {
	return {
		read(relPath: string): string | undefined {
			if (Object.prototype.hasOwnProperty.call(overrides, relPath)) return overrides[relPath];
			return realTheme.read(relPath);
		},
	};
}

// 実テーマの single.html から一箇所だけ置換する。対象文字列が無ければ失敗させる(黙って素通りさせない)。
function singleWithReplaced(from: string, to: string): string {
	const src = realTheme.read(SINGLE);
	if (src === undefined) throw new Error(`${SINGLE} not found in real theme`);
	const idx = src.indexOf(from);
	if (idx < 0 || src.indexOf(from, idx + 1) >= 0) {
		throw new Error(`replace target must occur exactly once: ${from}`);
	}
	return src.replace(from, to);
}

function fixture(relPath: string): string {
	return readFileSync(join(FIXTURES, relPath), 'utf8');
}

// fixture 内の唯一の <main ...>...</main> 要素全体を切り出す。
function extractMain(html: string): string {
	const m = /<main\b[^>]*>[\s\S]*?<\/main>/.exec(html);
	if (!m) throw new Error('main element not found in fixture');
	return m[0];
}

// <main> の直下要素を、元文字列のオフセットで切り出す(DOM の子要素抽出)。
function mainElementChildren(html: string): string[] {
	const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
	const main = fragment.childNodes.find(
		(n) => 'tagName' in n && (n as { tagName: string }).tagName === 'main',
	) as { childNodes: unknown[] } | undefined;
	if (main === undefined) throw new Error('main element not found in output');
	const out: string[] = [];
	for (const child of main.childNodes) {
		if (!('tagName' in (child as object))) continue;
		const loc = (child as { sourceCodeLocation?: { startOffset: number; endOffset: number } })
			.sourceCodeLocation;
		if (loc === undefined || loc === null) throw new Error('missing source location');
		out.push(html.slice(loc.startOffset, loc.endOffset));
	}
	return out;
}

function countOccurrences(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

// ThemeResolveError の code を検証する。投げなければ失敗。
function expectThemeErrorCode(fn: () => unknown, code: string): void {
	let caught: unknown;
	try {
		fn();
	} catch (e) {
		caught = e;
	}
	expect(caught).toBeInstanceOf(ThemeResolveError);
	expect((caught as ThemeResolveError).code).toBe(code);
}

const NAV_PAGE_LIST = '<!-- wp:page-list /-->';

// dump.sql ID 2 (Sample Page) の実値を、開いている DB から取り出す。
function samplePageFromDb(db: DatabaseSync) {
	const row = db.prepare('SELECT * FROM posts WHERE ID = ?').get(2) as
		| Record<string, string | number | null>
		| undefined;
	if (row === undefined) throw new Error('posts の ID 2 (Sample Page) が見つからない');
	return {
		id: Number(row.ID),
		title: String(row.post_title ?? ''),
		slug: String(row.post_name ?? ''),
		parent: Number(row.post_parent),
		menuOrder: Number(row.menu_order),
	};
}

// main 描画用の ctx。現在投稿は slug で DB から取り出す。
function buildCtx(db: DatabaseSync, slug = 'spike-blocks'): RenderCtx {
	const current = openCurrentPost(db, { slug });
	if (!current) throw new Error(`post not found: ${slug}`);
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080', tagline: '', logoId: null },
		page: { isHome: false, isSingular: true },
		navigation: { post: { id: 4, content: NAV_PAGE_LIST }, pages: [samplePageFromDb(db)] },
		post: current.post,
		content: current.content,
		queries: makeQueriesPort(db),
	} as unknown as RenderCtx;
}

// spike-blocks 投稿の ID を DB から取り出す(固定値を置かない)。
function spikeBlocksId(db: DatabaseSync): number {
	const row = db.prepare('SELECT ID FROM posts WHERE post_name = ?').get('spike-blocks') as
		| { ID: number }
		| undefined;
	if (row === undefined) throw new Error('spike-blocks post not found');
	return Number(row.ID);
}

describe('D3g-01: S0 (openDumpDb のみ) で renderMain の出力が spike-blocks.html の main と htmlEquals で一致する', () => {
	it('D3g-01: renderMain(realTheme, ctx) が fixtures/ref/spike-blocks.html の <main id="wp--skip-link--target"> 要素と一致する', () => {
		// Red: mainCompose.ts 未存在のため import 解決に失敗し、収集段階で落ちる。
		const db = openDumpDb();
		try {
			const out = renderMain(realTheme, buildCtx(db));
			const expected = extractMain(fixture('spike-blocks.html'));
			expect(out.startsWith('<main')).toBe(true);
			expect(out).toContain(SKIP_ID_ATTR);
			expect(htmlEquals(out, expected)).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3g-02: main の直下 2 子要素が regions/main-01.html と regions/main-02.html に一致する', () => {
	it('D3g-02: main の 1 番目の子要素が main-01.html、2 番目 (More posts 群) が main-02.html と一致する', () => {
		// Red: renderMain 未実装のため import 解決で収集失敗する。
		const db = openDumpDb();
		try {
			const out = renderMain(realTheme, buildCtx(db));
			const children = mainElementChildren(out);
			expect(children).toHaveLength(2);
			expect(htmlEquals(children[0] as string, fixture('regions/main-01.html'))).toBe(true);
			expect(htmlEquals(children[1] as string, fixture('regions/main-02.html'))).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3g-03: S1〜S3 の累積 DB 状態で main が set-main2 の期待 HTML と一致する', () => {
	it('D3g-03: S1 (applyS1) の出力が set-main2/main.mixed-status-protected-adjacent.html と一致する', () => {
		// Red: renderMain 未実装のため収集失敗する(実装後は S1 の状態差分が出ればここで落ちる)。
		const db = openDumpDb();
		try {
			applyS1(db);
			const out = renderMain(realTheme, buildCtx(db));
			expect(htmlEquals(out, extractMain(fixture('set-main2/main.mixed-status-protected-adjacent.html')))).toBe(true);
		} finally {
			db.close();
		}
	});

	it('D3g-03: S2 (applyS1+applyS2) の出力が set-main2/main.classes-tiebreak-format-tag.html と一致する', () => {
		// Red: renderMain 未実装のため収集失敗する。
		const db = openDumpDb();
		try {
			applyS1(db);
			applyS2(db);
			const out = renderMain(realTheme, buildCtx(db));
			expect(htmlEquals(out, extractMain(fixture('set-main2/main.classes-tiebreak-format-tag.html')))).toBe(true);
		} finally {
			db.close();
		}
	});

	it('D3g-03: S3 (applyS1+applyS2+applyS3) の出力が set-main2/main.author-real.html と一致する', () => {
		// Red: renderMain 未実装のため収集失敗する。
		const db = openDumpDb();
		try {
			applyS1(db);
			applyS2(db);
			applyS3(db);
			const out = renderMain(realTheme, buildCtx(db));
			expect(htmlEquals(out, extractMain(fixture('set-main2/main.author-real.html')))).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3g-04: 承認コメント付き投稿 (hello-world) を現在投稿にすると commentsState 未対応で RangeError', () => {
	it('D3g-04: S3 状態で current post を hello-world にすると renderMain が RangeError を投げる', () => {
		// Red: renderMain 未実装のため収集失敗する。実装後は commentsState の unsupported を RangeError で拒否する想定。
		// main.comment-approved-hello-world.html との一致は要求しない(仕様どおり)。
		const db = openDumpDb();
		try {
			applyS1(db);
			applyS2(db);
			applyS3(db);
			const ctx = buildCtx(db, 'hello-world');
			expect(() => renderMain(realTheme, ctx)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3g-05: header → main → footer を同一 ctx で描画しても各部分が期待 HTML と一致する', () => {
	it('D3g-05: 順序 header→main→footer で header は regions/header.html、footer は regions/footer.html と一致する', () => {
		// Red: renderMain / renderFooter の合成が未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const ctx = buildCtx(db);
			const header = renderHeader(realTheme, ctx);
			renderMain(realTheme, ctx);
			const footer = renderFooter(realTheme, ctx);
			expect(htmlEquals(header, fixture('regions/header.html'))).toBe(true);
			expect(htmlEquals(footer, fixture('regions/footer.html'))).toBe(true);
		} finally {
			db.close();
		}
	});

	it('D3g-05: main を先に描画しても main の出力は header→main→footer の順序と同一', () => {
		// Red: renderMain 未実装のため収集失敗する想定。モーダル番号は header 側が先に払い出す前提のため、順序で main 出力が変わってはならない。
		const dbA = openDumpDb();
		const dbB = openDumpDb();
		try {
			const ctxA = buildCtx(dbA);
			renderHeader(realTheme, ctxA);
			const mainAfterHeader = renderMain(realTheme, ctxA);
			renderFooter(realTheme, ctxA);

			const ctxB = buildCtx(dbB);
			const mainFirst = renderMain(realTheme, ctxB);

			expect(htmlEquals(mainFirst, mainAfterHeader)).toBe(true);
		} finally {
			dbA.close();
			dbB.close();
		}
	});
});

describe('D3g-06: skip-link のターゲット id はちょうど 1 つ。既存 id や文字列衝突は RangeError', () => {
	it('D3g-06: 同一 ctx で 2 回呼んでも出力内の skip-link ターゲット id はちょうど 1 個', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const ctx = buildCtx(db);
			const first = renderMain(realTheme, ctx);
			const second = renderMain(realTheme, ctx);
			expect(countOccurrences(first, SKIP_ID_ATTR)).toBe(1);
			expect(countOccurrences(second, SKIP_ID_ATTR)).toBe(1);
		} finally {
			db.close();
		}
	});

	it('D3g-06: main が既に id を持つテーマは RangeError (anchor 属性で id を付与する想定)', () => {
		// Red: renderMain 未実装のため収集失敗する想定。anchor が main の id として出力されるかは未検証の前提。
		const db = openDumpDb();
		try {
			const theme = themeWith({
				[SINGLE]: singleWithReplaced(
					'<!-- wp:group {"tagName":"main",',
					'<!-- wp:group {"tagName":"main","anchor":"x",',
				),
			});
			const ctx = buildCtx(db);
			expect(() => renderMain(theme, ctx)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it('D3g-06: 本文に文字列 wp-skip-link--target を含むテーマは RangeError', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const theme = themeWith({
				[SINGLE]: singleWithReplaced(
					'<!-- wp:post-title {"level":1} /-->',
					'<!-- wp:post-title {"level":1} /-->\n<!-- wp:paragraph --><p>wp--skip-link--target</p><!-- /wp:paragraph -->',
				),
			});
			const ctx = buildCtx(db);
			expect(() => renderMain(theme, ctx)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3g-07: テーマ・テンプレート・ブロック・ctx の異常系が指定のエラーで拒否される', () => {
	it('D3g-07: single.html が無いテーマは ThemeResolveError (code unknown-template)', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const theme = themeWith({ [SINGLE]: undefined });
			const ctx = buildCtx(db);
			expectThemeErrorCode(() => renderMain(theme, ctx), 'unknown-template');
		} finally {
			db.close();
		}
	});

	it('D3g-07: template-part が 1 個しか無い single.html は ThemeResolveError (code invalid-attrs)', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const theme = themeWith({ [SINGLE]: '<!-- wp:template-part {"slug":"header"} /-->\n' });
			const ctx = buildCtx(db);
			expectThemeErrorCode(() => renderMain(theme, ctx), 'invalid-attrs');
		} finally {
			db.close();
		}
	});

	it('D3g-07: main 直下に未知ブロックがあると UnsupportedBlockError', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const theme = themeWith({
				[SINGLE]: singleWithReplaced(
					'<!-- wp:pattern {"slug":"twentytwentyfive/more-posts"} /-->',
					'<!-- wp:unknown/x /-->',
				),
			});
			const ctx = buildCtx(db);
			expect(() => renderMain(theme, ctx)).toThrow(UnsupportedBlockError);
		} finally {
			db.close();
		}
	});

	it('D3g-07: group 内の未知ブロックも UnsupportedBlockError', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const theme = themeWith({
				[SINGLE]: singleWithReplaced(
					'<!-- wp:post-featured-image {"aspectRatio":"3/2"} /-->',
					'<!-- wp:unknown/x /-->',
				),
			});
			const ctx = buildCtx(db);
			expect(() => renderMain(theme, ctx)).toThrow(UnsupportedBlockError);
		} finally {
			db.close();
		}
	});

	it('D3g-07: ctx.post が無いと RangeError', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			const ctx = { ...buildCtx(db), post: undefined } as unknown as RenderCtx;
			expect(() => renderMain(realTheme, ctx)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3g-08: DB 状態が未対応のとき UnsupportedDataError で失敗し、部分出力は返らない', () => {
	it('D3g-08: 一覧の窓内の投稿が sticky だと more-posts の queryPosts が UnsupportedDataError で、部分出力なしに拒否される', () => {
		const db = openDumpDb();
		try {
			// 現在投稿(5)ではなく、一覧の窓に入る投稿 1 を sticky にする(現在投稿の open は成功する)。
			updateRow(db, 'options', 'option_name', 'sticky_posts', { option_value: 'a:1:{i:0;i:1;}' });
			const ctx = buildCtx(db);
			expect(() => renderMain(realTheme, ctx)).toThrow(UnsupportedDataError);
		} finally {
			db.close();
		}
	});

	it('D3g-08: S2 (投稿 26 が現在投稿と同一日時) で renderMain が UnsupportedDataError を投げる', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			applyS1(db);
			applyS2(db);
			// 投稿 26(tie-a1)は投稿 27 と同日時。前後ナビの adjacent が UnsupportedDataError を投げる。
			const ctx = buildCtx(db, 'tie-a1');
			expect(() => renderMain(realTheme, ctx)).toThrow(UnsupportedDataError);
		} finally {
			db.close();
		}
	});
});

describe('D3g-09: 過学習ガード。DB の値変更と site.url 変更が出力に反映される', () => {
	it('D3g-09: updateRow で title と content を変えると、その値が出力に現れる', () => {
		// Red: renderMain 未実装のため収集失敗する想定。
		const db = openDumpDb();
		try {
			updateRow(db, 'posts', 'ID', spikeBlocksId(db), {
				post_title: 'D3g09 Changed Title',
				post_content: '<!-- wp:paragraph --><p>D3G09-CONTENT-MARK</p><!-- /wp:paragraph -->',
			});
			const out = renderMain(realTheme, buildCtx(db));
			expect(out).toContain('D3g09 Changed Title');
			expect(out).toContain('D3G09-CONTENT-MARK');
		} finally {
			db.close();
		}
	});

	it('D3g-09: site.url を変えると、コメントフォームの action とリンクの URL が変わる', () => {
		// Red: renderMain 未実装のため収集失敗する想定。wp-comments-post.php の形は WordPress 標準を前提とする(未検証)。
		const db = openDumpDb();
		try {
			const base = buildCtx(db);
			const changed = {
				...base,
				site: { ...(base as unknown as { site: object }).site, url: 'http://example.test:9999' },
			} as unknown as RenderCtx;
			const outBase = renderMain(realTheme, base);
			const outChanged = renderMain(realTheme, changed);
			expect(outChanged).not.toBe(outBase);
			expect(outChanged).toContain('http://example.test:9999');
			expect(outChanged).toContain('http://example.test:9999/wp-comments-post.php');
		} finally {
			db.close();
		}
	});
});

// D3g-06/07 補強(STEP6 mutation 生存): main の個数・テンプレート名の引数・名前の前方一致。
describe('renderMain 補強', () => {
	const rm = (theme: ThemeFiles, name?: string) => {
		const db = openDumpDb();
		try {
			const ctx = buildCtx(db);
			return name === undefined ? renderMain(theme, ctx) : renderMain(theme, ctx, name);
		} finally {
			db.close();
		}
	};
	it('D3g-06: main 要素が 2 つ(入れ子)になるテンプレートは RangeError', () => {
		const theme = themeWith({
			[SINGLE]: singleWithReplaced(
				'<!-- wp:post-title {"level":1} /-->',
				'<!-- wp:group {"tagName":"main"} --><main class="wp-block-group"></main><!-- /wp:group -->',
			),
		});
		expect(() => rm(theme)).toThrow(RangeError);
	});
	it('D3g-06: main 要素が 0 個のテンプレートは RangeError', () => {
		const theme = themeWith({
			[SINGLE]: singleWithReplaced('<!-- wp:group {"tagName":"main",', '<!-- wp:group {"tagName":"div",'),
		});
		expect(() => rm(theme)).toThrow(RangeError);
	});
	it('D3g-06: <mainx> のような別要素名は main の開始タグとして数えない(前方一致しない)', () => {
		const theme = themeWith({
			[SINGLE]: singleWithReplaced('<!-- wp:group {"tagName":"main",', '<!-- wp:group {"tagName":"section",'),
		});
		// main が無いので RangeError(section を main と誤認して id を付けない)。
		expect(() => rm(theme)).toThrow(RangeError);
	});
	it('D3g-07: templateName 引数が使われる(別名のテンプレートを読む)', () => {
		const other = singleWithReplaced('<!-- wp:post-title {"level":1} /-->', '<!-- wp:post-title {"level":2} /-->');
		const theme = themeWith({ 'templates/other.html': other });
		const viaOther = rm(theme, 'other');
		expect(viaOther).toContain('<h2 class="wp-block-post-title">');
		expect(rm(theme)).toContain('<h1 class="wp-block-post-title">');
	});
});

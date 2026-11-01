// SPDX-License-Identifier: GPL-3.0-only
/**
 * テーマ解決 (D-1a): parts/<slug>.html の取得と、`wp:pattern` の再帰展開。
 * 対応しない PHP は黙って消さず unsupported-php で拒否する。
 */

export interface ThemeFiles {
  read(relPath: string): string | undefined;
}

export type ThemeErrorCode =
  | 'unknown-part'
  | 'unknown-pattern'
  | 'cycle'
  | 'unsupported-php'
  | 'invalid-attrs'
  | 'unknown-template';

export class ThemeResolveError extends Error {
  readonly code: ThemeErrorCode;
  readonly detail: string;

  constructor(code: ThemeErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ThemeResolveError';
    this.code = code;
    this.detail = detail;
  }
}

const PART_SLUG = /^[a-z0-9-]+$/;
const PATTERN_SLUG = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const MAX_DEPTH = 16;

/** `<!-- wp:pattern ... /-->` (self-closing 形式のみ正常系)。group1 = 属性テキスト, group2 = "/" の有無 */
const PATTERN_COMMENT = /<!--\s*wp:pattern\b([\s\S]*?)(\/?)-->/g;

/** トークン間に許可する空白とブロックコメント */
const SP = String.raw`(?:\s|/\*[\s\S]*?\*/)*`;
/** PHP 単引用符リテラル (キャプチャ版 / 非キャプチャ版) */
const LIT = String.raw`'((?:[^'\\]|\\.)*)'`;
const LIT_NC = String.raw`'(?:[^'\\]|\\.)*'`;

/** `<?php ... ?>` ブロック1個。中身は式ごとに照合する */
const PHP_BLOCK = /<\?php([\s\S]*?)\?>/g;

/** 許可式1: esc_html_e / esc_attr_e / echo esc_html__ / echo esc_attr__ ( 'X', 'dom' ) */
const PHP_LEGACY = new RegExp(
  String.raw`^(?:esc_(?:html|attr)_e|echo\s+esc_(?:html|attr)__)${SP}\(${SP}${LIT}${SP},${SP}${LIT_NC}${SP}\)${SP};$`,
);

/** 許可式A: echo esc_html_x / esc_attr_x ( 'X', 'ctx', 'dom' ). ctx と dom は無視 */
const PHP_X = new RegExp(
  String.raw`^echo\s+esc_(?:html|attr)_x${SP}\(${SP}${LIT}${SP},${SP}${LIT_NC}${SP},${SP}${LIT_NC}${SP}\)${SP};$`,
);

/**
 * 許可式B: printf( esc_html__( 'FMT', 'dom' ), '<a href="' . esc_url( __( 'URL', 'dom' ) ) . '" rel="nofollow">LABEL</a>' );
 * キャプチャ: 1=FMT, 2=URL, 3=LABEL
 */
const PHP_PRINTF = new RegExp(
  String.raw`^printf${SP}\(${SP}esc_html__${SP}\(${SP}${LIT}${SP},${SP}${LIT_NC}${SP}\)${SP},${SP}` +
    String.raw`'<a href="'${SP}\.${SP}esc_url${SP}\(${SP}__${SP}\(${SP}${LIT}${SP},${SP}${LIT_NC}${SP}\)${SP}\)${SP}\.${SP}` +
    String.raw`'" rel="nofollow">((?:[^'\\]|\\.)*)</a>'${SP}\)${SP};$`,
);

/** PHP の開始タグ (未対応式の検出用) */
const PHP_OPEN = /<\?(?:php|=)/;

/** 先頭の `<?php ... ?>` ヘッダ候補 (中身がコメントのみの場合だけ除去する) */
const PHP_HEADER = /^<\?php([\s\S]*?)\?>\r?\n?/;

const ENTITY: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

/** text / attr 共通の escape 集合 */
function escapeEntities(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITY[c] ?? c);
}

/** PHP 単引用符リテラルの解釈: `\'` と `\\` のみ */
function unescapeSingleQuoted(s: string): string {
  return s.replace(/\\(['\\])/g, '$1');
}

function stripHeader(src: string): string {
  const m = PHP_HEADER.exec(src);
  if (!m) return src;
  const inner = (m[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return inner.trim() === '' ? src.slice(m[0].length) : src;
}

/** 1ブロックの中身 (code) を許可式と照合する。一致しなければ unsupported-php。 */
function translatePhpBlock(match: string, code: string): string {
  const src = code.trim();

  const legacy = PHP_LEGACY.exec(src);
  if (legacy) {
    return escapeEntities(unescapeSingleQuoted(legacy[1] ?? ''));
  }

  const xctx = PHP_X.exec(src);
  if (xctx) {
    return escapeEntities(unescapeSingleQuoted(xctx[1] ?? ''));
  }

  const printf = PHP_PRINTF.exec(src);
  if (printf) {
    const fmt = unescapeSingleQuoted(printf[1] ?? '');
    const url = unescapeSingleQuoted(printf[2] ?? '');
    const label = unescapeSingleQuoted(printf[3] ?? '');
    if (fmt.split('%s').length !== 2) {
      throw new ThemeResolveError('unsupported-php', `printf FMT must contain exactly one %s: ${match}`);
    }
    if (!/^https?:\/\//.test(url)) {
      throw new ThemeResolveError('unsupported-php', `printf URL must be absolute http(s): ${match}`);
    }
    if (/[<>"']/.test(label)) {
      throw new ThemeResolveError('unsupported-php', `printf LABEL contains forbidden characters: ${match}`);
    }
    const anchor = `<a href="${escapeEntities(url)}" rel="nofollow">${escapeEntities(label)}</a>`;
    return escapeEntities(fmt).replace('%s', () => anchor);
  }

  throw new ThemeResolveError('unsupported-php', match);
}

function translatePhp(body: string): string {
  return body.replace(PHP_BLOCK, (match: string, code: string) => translatePhpBlock(match, code));
}

function parseSlug(attrText: string): string {
  const text = attrText.trim();
  let attrs: unknown = {};
  if (text !== '') {
    try {
      attrs = JSON.parse(text);
    } catch {
      throw new ThemeResolveError('invalid-attrs', `JSON parse failed: ${text}`);
    }
  }
  if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
    throw new ThemeResolveError('invalid-attrs', 'wp:pattern attrs must be a JSON object');
  }
  const slug = (attrs as { slug?: unknown }).slug;
  if (typeof slug !== 'string') {
    throw new ThemeResolveError('invalid-attrs', 'wp:pattern slug must be a string');
  }
  if (!PATTERN_SLUG.test(slug)) {
    throw new ThemeResolveError('invalid-attrs', `malformed pattern slug: ${slug}`);
  }
  return slug;
}

function expand(markup: string, theme: ThemeFiles, stack: readonly string[]): string {
  if (PHP_OPEN.test(markup)) {
    throw new ThemeResolveError('unsupported-php', 'PHP open tag outside the supported expressions');
  }
  return markup.replace(PATTERN_COMMENT, (_match: string, attrText: string, slash: string) => {
    if (slash !== '/') {
      throw new ThemeResolveError('invalid-attrs', 'wp:pattern must be self-closing');
    }
    const slug = parseSlug(attrText);
    if (stack.includes(slug) || stack.length + 1 > MAX_DEPTH) {
      throw new ThemeResolveError('cycle', `${[...stack, slug].join(' -> ')}`);
    }
    const name = slug.slice(slug.indexOf('/') + 1);
    const raw = theme.read(`patterns/${name}.php`);
    if (raw === undefined) {
      throw new ThemeResolveError('unknown-pattern', `patterns/${name}.php not found for ${slug}`);
    }
    const body = translatePhp(stripHeader(raw));
    return expand(body, theme, [...stack, slug]);
  });
}

/** parts/<slug>.html の内容をそのまま返す。slug 不正は読み取りを行わず unknown-part。 */
export function resolveTemplatePart(theme: ThemeFiles, slug: string): string {
  if (!PART_SLUG.test(slug)) {
    throw new ThemeResolveError('unknown-part', `invalid part slug: ${slug}`);
  }
  const content = theme.read(`parts/${slug}.html`);
  if (content === undefined) {
    throw new ThemeResolveError('unknown-part', `parts/${slug}.html not found`);
  }
  return content;
}

/** `wp:pattern` を patterns/<name>.php の展開結果で再帰的に置換する。 */
export function expandPatterns(markup: string, theme: ThemeFiles): string {
  return expand(markup, theme, []);
}

const TEMPLATE_NAME = /^[a-z0-9-]+$/;
/** `<!-- wp:template-part ... -->` / `... /-->`. group1 = 属性テキスト, group2 = "/" の有無 */
const TEMPLATE_PART_COMMENT = /<!--\s*wp:template-part\b([\s\S]*?)(\/?)-->/g;
/** 閉じコメント `<!-- /wp:template-part -->` (非自己閉じ形式の検出用) */
const TEMPLATE_PART_CLOSE = /<!--\s*\/wp:template-part\s*-->/;

/** template-part の属性 JSON から slug を取り出す。キーは slug のみ、slug は PART_SLUG に一致する文字列。 */
function parseTemplatePartSlug(attrText: string): string {
  const text = attrText.trim();
  let attrs: unknown;
  try {
    attrs = JSON.parse(text);
  } catch {
    throw new ThemeResolveError('invalid-attrs', `template-part JSON parse failed: ${text}`);
  }
  if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
    throw new ThemeResolveError('invalid-attrs', 'template-part attrs must be a JSON object');
  }
  const keys = Object.keys(attrs);
  if (keys.length !== 1 || keys[0] !== 'slug') {
    throw new ThemeResolveError('invalid-attrs', `template-part attrs must contain only slug: ${text}`);
  }
  const slug = (attrs as { slug?: unknown }).slug;
  if (typeof slug !== 'string' || !PART_SLUG.test(slug)) {
    throw new ThemeResolveError('invalid-attrs', `malformed template-part slug: ${String(slug)}`);
  }
  return slug;
}

/**
 * templates/<name>.html を解析し、header / footer の slug と main マークアップを返す。
 * 規約: template-part はちょうど 2 個。先頭が header、末尾が footer。main は間のマークアップ (trim 済み)。
 */
export function parseTemplate(
  theme: ThemeFiles,
  name: string,
): { header: string; footer: string; main: string } {
  if (!TEMPLATE_NAME.test(name)) {
    throw new ThemeResolveError('unknown-template', `invalid template name: ${name}`);
  }
  const content = theme.read(`templates/${name}.html`);
  if (content === undefined) {
    throw new ThemeResolveError('unknown-template', `templates/${name}.html not found`);
  }
  if (TEMPLATE_PART_CLOSE.test(content)) {
    throw new ThemeResolveError('invalid-attrs', 'template-part must be self-closing');
  }

  const found: { start: number; end: number; slug: string }[] = [];
  for (const m of content.matchAll(TEMPLATE_PART_COMMENT)) {
    if (m[2] !== '/') {
      throw new ThemeResolveError('invalid-attrs', 'template-part must be self-closing');
    }
    const start = m.index ?? 0;
    found.push({ start, end: start + m[0].length, slug: parseTemplatePartSlug(m[1] ?? '') });
  }
  if (found.length !== 2) {
    throw new ThemeResolveError('invalid-attrs', `expected exactly 2 template-parts, found ${found.length}`);
  }
  const [head, foot] = found as [(typeof found)[number], (typeof found)[number]];
  if (content.slice(0, head.start).trim() !== '') {
    throw new ThemeResolveError('invalid-attrs', 'header template-part must be at the head of the template');
  }
  if (content.slice(foot.end).trim() !== '') {
    throw new ThemeResolveError('invalid-attrs', 'footer template-part must be at the tail of the template');
  }
  const main = content.slice(head.end, foot.start).trim();
  if (main.includes('wp:template-part')) {
    throw new ThemeResolveError('invalid-attrs', 'main must not contain wp:template-part');
  }
  // 位置だけでは header/footer の入れ替えを区別できないため、役割を slug 名に要求する
  // (TT25 の header / header-large-title / vertical-header などを許し、footer-first は拒否)。
  if (!head.slug.includes('header')) {
    throw new ThemeResolveError('invalid-attrs', `first template-part slug must contain "header": ${head.slug}`);
  }
  if (!foot.slug.includes('footer')) {
    throw new ThemeResolveError('invalid-attrs', `last template-part slug must contain "footer": ${foot.slug}`);
  }
  return { header: head.slug, footer: foot.slug, main };
}

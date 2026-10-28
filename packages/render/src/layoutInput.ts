// SPDX-License-Identifier: GPL-3.0-only
// WP の wp_render_layout_support_flag に渡すハッシュ入力配列を組み立てる。
// 規則の一次情報: docs/spike-notes/container-class-hash.md
// 基準 WP: layout.php:1096-1100 で確認済み。
// 型が想定外のときは RangeError を投げる(fail-closed。黙って既定値に落とさない)。

export interface GlobalConfig {
  /** settings.spacing.blockGap が定義済み(null でない)または settings.appearanceTools===true。 */
  hasBlockGapSupport: boolean;
  /** styles.spacing.blockGap (文字列のみ)。 */
  globalBlockGap: string | null;
  /** styles.blocks[name].spacing.blockGap (文字列のみ)。 */
  blockGapByBlock: Record<string, string>;
  /** ブロック名 → 既定 layout。引数をそのまま保持する(テーマの settings.layout は使わない)。 */
  blockLayoutDefaults: Record<string, Record<string, unknown>>;
}

type JsonObject = Record<string, unknown>;

// 既定のブロック gap。md の既定値 (__experimentalDefault 未検証のため暫定)。
const DEFAULT_BLOCK_GAP = '0.5em';

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isAbsent(v: unknown): v is undefined | null {
  return v === undefined || v === null;
}

// 親が未定義/null なら undefined、オブジェクトでなければ RangeError。
function child(parent: unknown, key: string, where: string): unknown {
  if (isAbsent(parent)) return undefined;
  if (!isObject(parent)) {
    throw new RangeError(`${where} はオブジェクトである必要がある`);
  }
  return parent[key];
}

// 未定義/null は null、文字列以外は RangeError。
function optionalString(v: unknown, where: string): string | null {
  if (isAbsent(v)) return null;
  if (typeof v !== 'string') {
    throw new RangeError(`${where} は文字列である必要がある: ${typeof v}`);
  }
  return v;
}

export function globalConfigFromThemeJson(
  themeJson: unknown,
  blockLayoutDefaults: Record<string, Record<string, unknown>>,
): GlobalConfig {
  if (!isObject(themeJson)) {
    throw new RangeError('theme.json はオブジェクトである必要がある');
  }
  const settings = child(themeJson, 'settings', 'theme.json');
  const styles = child(themeJson, 'styles', 'theme.json');

  // WP は appearanceTools:true のとき spacing.blockGap を true に展開する。
  const appearanceTools = child(settings, 'appearanceTools', 'settings') === true;
  const explicitBlockGap = child(
    child(settings, 'spacing', 'settings'),
    'blockGap',
    'settings.spacing',
  );
  const hasBlockGapSupport = appearanceTools || !isAbsent(explicitBlockGap);

  const globalBlockGap = optionalString(
    child(child(styles, 'spacing', 'styles'), 'blockGap', 'styles.spacing'),
    'styles.spacing.blockGap',
  );

  const blocks = child(styles, 'blocks', 'styles');
  const blockGapByBlock: Record<string, string> = {};
  if (!isAbsent(blocks)) {
    if (!isObject(blocks)) {
      throw new RangeError('styles.blocks はオブジェクトである必要がある');
    }
    for (const name of Object.keys(blocks)) {
      const gap = optionalString(
        child(child(blocks[name], 'spacing', `styles.blocks.${name}`), 'blockGap', `styles.blocks.${name}.spacing`),
        `styles.blocks.${name}.spacing.blockGap`,
      );
      if (gap !== null) blockGapByBlock[name] = gap;
    }
  }

  return { hasBlockGapSupport, globalBlockGap, blockGapByBlock, blockLayoutDefaults };
}

const PRESET_PREFIX = 'var:preset|';
const PRESET_PART = /^[a-z0-9-]+$/;

// fallback gap 用: var:preset|<type>|<slug> を var(--wp--preset--<type>--<slug>) に解決する。
// プリセット形式でない文字列はそのまま返す。形式不正は RangeError(fail-closed)。
function resolvePresetGap(v: string): string {
  if (!v.startsWith(PRESET_PREFIX)) return v;
  const parts = v.split('|');
  if (parts.length !== 3) {
    throw new RangeError(`プリセット参照の形式が不正: ${v}`);
  }
  const [, type = '', slug = ''] = parts;
  if (!PRESET_PART.test(type) || !PRESET_PART.test(slug)) {
    throw new RangeError(`プリセット参照の type/slug が不正: ${v}`);
  }
  return `var(--wp--preset--${type}--${slug})`;
}

export function layoutHashInput(
  block: { name: string; attrs: Record<string, unknown> },
  cfg: GlobalConfig,
): unknown[] {
  const attrs = block.attrs;

  // $block['attrs']['layout'] ?? $default_layout(ブロック別) ?? []
  const blockDefault = Object.prototype.hasOwnProperty.call(cfg.blockLayoutDefaults, block.name)
    ? cfg.blockLayoutDefaults[block.name]
    : undefined;
  const usedLayout = attrs.layout ?? blockDefault ?? [];

  const spacing = child(child(attrs, 'style', 'attrs'), 'spacing', 'attrs.style');
  // wp_sanitize_block_gap_value 相当: 未定義は null、文字列はそのまま(preset 参照も保持)、それ以外は RangeError。
  const gapValue = optionalString(
    child(spacing, 'blockGap', 'attrs.style.spacing'),
    'attrs.style.spacing.blockGap',
  );

  // 決定順: ブロック別 styles > styles.spacing > 既定値。
  const blockLevel = Object.prototype.hasOwnProperty.call(cfg.blockGapByBlock, block.name)
    ? cfg.blockGapByBlock[block.name]
    : undefined;
  const fallbackGapValue = resolvePresetGap(blockLevel ?? cfg.globalBlockGap ?? DEFAULT_BLOCK_GAP);

  return [
    usedLayout,
    cfg.hasBlockGapSupport,
    gapValue,
    // NOTE: wp_should_skip_block_supports_serialization の判定根拠が md に無いため false 固定(未検証)。
    false,
    fallbackGapValue,
    spacing ?? null,
  ];
}

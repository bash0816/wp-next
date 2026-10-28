// SPDX-License-Identifier: GPL-3.0-only
// WP の wp_render_layout_support_flag が付けるコンテナクラスを再現する。
// 規則の一次情報: docs/spike-notes/container-class-hash.md
//   prefix . substr( md5( wp_json_encode( $input ) ), 0, 8 )
// 未対応の入力は fail-closed で RangeError を投げる(黙って別の値を返さない)。
import { createHash } from 'node:crypto';

// wp_json_encode の既定 depth (512)。境界の厳密な一致は未検証。
const MAX_DEPTH = 512;

// PHP の配列はキーが 10 進整数の文字列だと整数キーに変換され、JS とキー順も変わる。
// 該当するキーは再現できないため拒否する。
const PHP_INT_KEY = /^(0|-?[1-9][0-9]*)$/;

const isHex4 = (n: number): string => n.toString(16).padStart(4, '0');

function encodeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new RangeError('孤立サロゲートは UTF-8 として不正なため扱えない');
      }
      out += `\\u${isHex4(c)}\\u${isHex4(next)}`;
      i++;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      throw new RangeError('孤立サロゲートは UTF-8 として不正なため扱えない');
    }
    switch (c) {
      case 0x22:
        out += '\\"';
        break;
      case 0x5c:
        out += '\\\\';
        break;
      case 0x2f:
        out += '\\/';
        break;
      case 0x08:
        out += '\\b';
        break;
      case 0x0c:
        out += '\\f';
        break;
      case 0x0a:
        out += '\\n';
        break;
      case 0x0d:
        out += '\\r';
        break;
      case 0x09:
        out += '\\t';
        break;
      default:
        if (c < 0x20 || c >= 0x80) {
          out += `\\u${isHex4(c)}`;
        } else {
          out += s.charAt(i);
        }
    }
  }
  return `${out}"`;
}

function encodeValue(v: unknown, ancestors: Set<object>, depth: number): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return encodeString(v);
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) {
      throw new RangeError(`float / 非有限値は未対応: ${String(v)}`);
    }
    if (!Number.isSafeInteger(v)) {
      throw new RangeError(`安全範囲外の整数は未対応: ${String(v)}`);
    }
    return String(v);
  }
  if (typeof v !== 'object') {
    throw new RangeError(`未対応の型: ${typeof v}`);
  }
  if (v === null) return 'null';
  if (ancestors.has(v)) throw new RangeError('循環参照は未対応');
  if (depth > MAX_DEPTH) throw new RangeError('深さが上限を超えた');

  ancestors.add(v);
  try {
    if (Array.isArray(v)) {
      const items: string[] = [];
      for (let i = 0; i < v.length; i++) {
        if (!(i in v)) throw new RangeError('疎な配列は未対応');
        items.push(encodeValue(v[i], ancestors, depth + 1));
      }
      return `[${items.join(',')}]`;
    }

    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw new RangeError('プレーンオブジェクト・配列以外は未対応');
    }
    const keys = Object.keys(v);
    // PHP で decode された空の {} は空配列になり、json_encode は [] を出す。
    if (keys.length === 0) return '[]';
    const members: string[] = [];
    for (const key of keys) {
      if (PHP_INT_KEY.test(key)) {
        throw new RangeError(`整数風キーは PHP 配列と順序が一致しないため未対応: ${key}`);
      }
      const value = (v as Record<string, unknown>)[key];
      members.push(`${encodeString(key)}:${encodeValue(value, ancestors, depth + 1)}`);
    }
    return `{${members.join(',')}}`;
  } finally {
    ancestors.delete(v);
  }
}

/**
 * PHP の wp_json_encode (既定フラグ) と同じ JSON 文字列を返す。
 * `/` は `\/`、非ASCIIは小文字hexの `\uXXXX`(サロゲートペア)、`<>&'` は非エスケープ。
 */
export function toPhpJson(value: unknown): string {
  return encodeValue(value, new Set<object>(), 1);
}

function sanitizeBlockName(blockName: string): string {
  // core/group → core-group。WP の sanitize_title の完全再現ではなく、対応範囲だけ許す。
  const slug = blockName.toLowerCase().replace(/\//g, '-');
  if (!/^[a-z0-9_]+(?:-[a-z0-9_]+)*$/.test(slug)) {
    throw new RangeError(`未対応の blockName: ${blockName}`);
  }
  return slug;
}

/**
 * WP の wp_render_layout_support_flag が付けるコンテナクラス名を返す。
 * 例: containerClassName('core/group', input) → 'wp-container-core-group-is-layout-XXXXXXXX'
 */
export function containerClassName(blockName: string, input: unknown[]): string {
  if (!Array.isArray(input)) {
    throw new RangeError('input は配列である必要がある');
  }
  const prefix = `wp-container-${sanitizeBlockName(blockName)}-is-layout-`;
  const hash = createHash('md5').update(toPhpJson(input), 'utf8').digest('hex');
  return prefix + hash.slice(0, 8);
}

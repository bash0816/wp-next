// SPDX-License-Identifier: GPL-3.0-only
import { parseFragment, serialize } from 'parse5';

type Attr = { name: string; value: string };
type TreeNode = { nodeName: string; attrs?: Attr[]; childNodes?: TreeNode[]; value?: string };

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'code', 'pre', 'span', 'a',
  'ul', 'ol', 'li', 'blockquote', 'cite', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'sub', 'sup', 'small', 'mark', 'del', 'ins', 'abbr', 'q', 'kbd',
  'figure', 'figcaption', 'img',
]);

/** 中身ごと破棄するタグ (実行・埋め込み・フォーム系) */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea',
  'select', 'button', 'noscript', 'template', 'svg', 'math',
]);

const GLOBAL_ATTRS = new Set(['class', 'id', 'title', 'lang', 'dir', 'alt', 'width', 'height']);

const TAG_ATTRS: Record<string, ReadonlySet<string> | undefined> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src']),
};

const URL_ALLOWED_SCHEMES: Record<'href' | 'src', ReadonlySet<string>> = {
  href: new Set(['http', 'https', 'mailto', 'tel']),
  src: new Set(['http', 'https']),
};

function isSafeUrl(raw: string | undefined, attr: 'href' | 'src'): boolean {
  if (raw === undefined) {
    return false;
  }
  // ブラウザが無視する制御文字・空白を除去してから scheme を判定する
  const cleaned = raw.replace(/[\p{Cc}\s]/gu, '');
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  if (!match?.[1]) {
    return true; // scheme なし = 相対 URL
  }
  return URL_ALLOWED_SCHEMES[attr].has(match[1].toLowerCase());
}

function sanitizeAttrs(tag: string, attrs: Attr[]): Attr[] {
  const out: Attr[] = [];
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || name === 'style') {
      continue;
    }
    const allowed = GLOBAL_ATTRS.has(name) || (TAG_ATTRS[tag]?.has(name) ?? false);
    if (!allowed) {
      continue;
    }
    if (name === 'href' && !isSafeUrl(attr.value, 'href')) {
      continue;
    }
    if (name === 'src' && !isSafeUrl(attr.value, 'src')) {
      continue;
    }
    out.push({ name, value: attr.value });
  }

  if (tag === 'a') {
    const target = out.find((a) => a.name === 'target');
    if (target?.value.trim().toLowerCase() === '_blank') {
      const rel = out.find((a) => a.name === 'rel');
      if (rel === undefined) {
        out.push({ name: 'rel', value: 'noopener' });
      } else if (!rel.value.split(/\s+/).includes('noopener')) {
        rel.value = `${rel.value} noopener`.trim();
      }
    }
  }
  return out;
}

function sanitizeChildren(children: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const child of children) {
    if (child.nodeName === '#text') {
      out.push(child);
      continue;
    }
    if (child.nodeName.startsWith('#')) {
      // コメント・doctype などは破棄
      continue;
    }
    if (DROP_WITH_CONTENT.has(child.nodeName)) {
      continue;
    }
    if (!ALLOWED_TAGS.has(child.nodeName)) {
      // 許可されないタグは外側だけ落として子を昇格させる
      out.push(...sanitizeChildren(child.childNodes ?? []));
      continue;
    }
    if (child.nodeName === 'img' && !isSafeUrl(
      child.attrs?.find((a) => a.name.toLowerCase() === 'src')?.value,
      'src',
    )) {
      // src が無い・危険な img は要素ごと破棄する
      continue;
    }
    child.attrs = sanitizeAttrs(child.nodeName, child.attrs ?? []);
    child.childNodes = sanitizeChildren(child.childNodes ?? []);
    out.push(child);
  }
  return out;
}

/**
 * 出力 HTML を許可リスト方式でサニタイズする。
 * コメント・script/style などの実行系要素・危険な URL/属性を除去する。
 */
export function sanitizeHtml(html: string): string {
  const fragment = parseFragment(html) as unknown as TreeNode;
  fragment.childNodes = sanitizeChildren(fragment.childNodes ?? []);
  return serialize(fragment as never);
}

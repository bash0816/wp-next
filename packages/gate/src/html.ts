// SPDX-License-Identifier: GPL-3.0-only

const ESCAPES: Readonly<Record<string, string>> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

// HTML/XML 本文・属性値の共通エスケープ。`]]>` は `>` のエスケープで `]]&gt;` になる。
export function escapeHtml(value: string): string {
  return value.replace(/["&'<>]/g, (ch) => ESCAPES[ch] ?? ch);
}

// 投稿の公開パス。slug は URL セグメントとして安全化する。
export function postPath(slug: string): string {
  return `/p/${encodeURIComponent(slug)}`;
}

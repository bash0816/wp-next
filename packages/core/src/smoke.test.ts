// SPDX-License-Identifier: GPL-3.0-only
// ツールチェーン確認用のスモークテスト(TypeScript → Vitest → 実モジュールのimport)。
import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('@wpn/core smoke', () => {
  it('index モジュールが名前空間オブジェクトとして読み込める', () => {
    expect(typeof core).toBe('object');
    expect(Object.keys(core)).toEqual([]);
  });
});

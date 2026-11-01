// SPDX-License-Identifier: GPL-3.0-only
// テスト専用の入口(@wpn/db/testing)。本番コードから import しない。
export { openDumpDb, insertRow, updateRow } from './dumpDb.js';
export { addPost, addTerm, relate, applyS1, applyS2, applyS3 } from './mainStates.js';
export { makeQueriesPort } from './queriesPort.js';

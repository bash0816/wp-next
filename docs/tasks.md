# tasks (Phase1)
- [x] S0 monorepo雛形・lint(2規則)・Vitest — テスト10件Green、lint違反プローブでexit1確認(2026-10-26)
- [x] S1 schema + canView + 可視行クエリ — 101件Green。SQL mutation(全件返却)で16件Red確認。空文字パスワードのcanView不備を自己レビューで発見・修正(2026-10-26)
- [ ] S2 ゲート付きルート/許可リスト静的配信
- [ ] S3 非公開メディア(全親AND)
- [ ] S4 認証(ハッシュ検証/セッション/CSRF) / S4b ビルド成果物検査
- [x] 予算ガード(原子的予約): BudgetGuard+SqliteBudgetStore+GuardedObjectStore。135件Green。mutation(常にtrue)で9件Red。D1BudgetStore実装済(141件Green)。ストレージは月次リセットしない累積キー(2026-10-26)
- [ ] S5' 実Workers最小縦断実測 → S5 php-wasm → S6 → S7

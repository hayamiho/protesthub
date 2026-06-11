# Protest Hub プロジェクト憲法 (ANTIGRAVITY.md)

このファイルは、Protest Hub プロジェクトの長期的な指針と仕様を定めるものである。

## 1. プロジェクト概要
- **目的**: 市民プロテストで使用できるプラカードデザインの集約と提供。
- **ターゲット**: デモや街頭宣伝に参加する市民。
- **利用シーン**: サイトからデザインを選び、ダウンロードまたは直接印刷して使用する。

## 2. 実装原則 (MVP)
- **静的生成 (SSG)**: サーバーサイドの動的処理を避け、誰でもホスト可能な静的ファイル構成を維持する。
- **ユーザー体験**: 軽量で、スマートフォンからも快適に閲覧・利用できること。
- **OGP重視**: SNS（特にX）でのシェア時に、各デザインが正しく表示されることを最優先する。

## 3. 技術スタック
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript (No Frameworks)
- **Automation**: Node.js (個別HTML生成用スクリプト)
- **Hosting**: GitHub Pages / Vercel 等 (静的ホスティング)
- **Analytics**: Google Analytics (gtag.js)

## 4. ファイル構成ルール
- `design/index.html`: 壁状のデザイン一覧。
- `design/*.html`: 各デザインの個別特設ページ（自動生成）。
- `design/images/`: プラカード画像本望データ。

## 5. 管理フロー
- 新しい画像を追加する場合：
    1. `design/data.json` にメタデータを追加。
    2. 画像を `design/images/` に配置。
    3. 生成スクリプトを実行し、個別HTMLを更新。

---
*Last Updated: 2026-06-11*

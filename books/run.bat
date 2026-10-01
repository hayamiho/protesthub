@echo off
cd /d "%~dp0"
echo ProtestHub Books 更新プログラムを開始します...
echo.

echo [1/4] スプレッドシートから最新データを取得中...
node sync_books.js
if %errorlevel% neq 0 (
    echo [ERROR] スプレッドシートの同期に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo [2/4] 最新ツイートデータ（本文・画像・アイコン）を全自動取得中...
node fetch_tweets.js
if %errorlevel% neq 0 (
    echo [ERROR] ツイートデータの取得に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo [3/4] 書籍個別ページ（超軽量カード完全再現版）を生成中...
node generator.js
if %errorlevel% neq 0 (
    echo [ERROR] ページの生成に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo [4/4] OGP用画像を生成中...
node generate_ogp.js
if %errorlevel% neq 0 (
    echo [ERROR] OGP画像の生成に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo --------------------------------------------------
echo 更新が正常に完了しました！
echo ローカルの index.html を開いて確認してください。
echo --------------------------------------------------
pause

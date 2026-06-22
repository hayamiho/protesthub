@echo off
echo Protest Hub 更新プログラムを開始します...
echo.

echo [1/2] スプレッドシートから最新データを取得中...
node sync.js
if %errorlevel% neq 0 (
    echo [ERROR] スプレッドシートの同期に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo [2/2] 個別ページを生成中...
node generator.js
if %errorlevel% neq 0 (
    echo [ERROR] ページの生成に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo --------------------------------------------------
echo 更新が正常に完了しました！
echo ローカルの index.html を開いて確認してください。
echo --------------------------------------------------
pause

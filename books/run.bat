@echo off
cd /d "%~dp0"
echo Protest Hub / Books 更新プログラムを開始します...
echo.

echo [1/1] スプレッドシートから最新データを取得中...
node sync_books.js
if %errorlevel% neq 0 (
    echo [ERROR] スプレッドシートの同期に失敗しました。
    pause
    exit /b %errorlevel%
)
echo.

echo --------------------------------------------------
echo Books の更新が正常に完了しました！
echo ローカルの index.html を開いて確認してください。
echo --------------------------------------------------
pause

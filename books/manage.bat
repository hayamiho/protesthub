@echo off
cd /d "%~dp0"
echo ==================================================
echo  ProtestHub 書籍管理Webツールを起動しています...
echo ==================================================
echo.

rem ブラウザを自動起動
start http://localhost:3000/

rem ローカルNode.jsサーバーを起動
node admin_server.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] サーバーの起動に失敗しました。Node.jsがインストールされているか確認してください。
    pause
)

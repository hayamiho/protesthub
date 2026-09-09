const fs = require('fs');
const path = require('path');
const https = require('https');

// 設定: スプレッドシートを「ファイル」->「共有」->「ウェブに公開」(CSV出力)したURLを指定
const CSV_URL = process.env.BOOKS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8IR9EdM--8S590YqbE7jaUHWDb8lTR86ErcMpW0HS3c3OoCSrdZpX64Pk7wYkGQqxSKxWxzEE1MSa/pub?gid=1104113654&single=true&output=csv';
const DATA_JS = path.join(__dirname, 'data_books.js');

function downloadCsv(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(downloadCsv(res.headers.location));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString('utf8'));
            });
        }).on('error', (err) => reject(err));
    });
}

function parseCsv(csv) {
    const results = [];
    let currentField = '';
    let inQuotes = false;
    let currentRow = [];

    const content = csv.replace(/\r\n/g, '\n');

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField);
                results.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        results.push(currentRow);
    }

    if (results.length === 0) return [];

    const headers = results[0].map(h => h.trim());
    const data = [];
    for (let i = 1; i < results.length; i++) {
        const row = results[i];
        if (row.length === 1 && !row[0]) continue;

        const entry = {};
        headers.forEach((h, index) => {
            entry[h] = (row[index] || '').trim();
        });
        data.push(entry);
    }
    return data;
}

async function syncBooks() {
    console.log('--- Books Database Sync Started ---');
    try {
        console.log('Fetching CSV from Google Sheets...');
        const csv = await downloadCsv(CSV_URL);

        // レスポンスの検証（HTMLや認証エラー画面が返された場合のガード）
        if (csv.trim().toLowerCase().startsWith('<!doctype html') || csv.includes('<html')) {
            throw new Error('スプレッドシートからの取得結果がHTML（ログイン/アクセス要求画面）です。\nGoogleスプレッドシートの「ファイル」->「共有」->「ウェブに公開」で Books シートがCSV公開されているか確認してください。');
        }

        const data = parseCsv(csv);
        if (data.length === 0 || Object.keys(data[0] || {}).length <= 1) {
            throw new Error('有効なCSVデータが取得できませんでした。スプレッドシートの公開設定およびヘッダー行を確認してください。');
        }

        console.log(`Downloaded ${data.length} book records.`);

        const jsContent = `// ProtestHub Books Master Data (Synced from Google Sheets)
const BOOKS_DATA = ${JSON.stringify(data, null, 4)};
`;
        fs.writeFileSync(DATA_JS, jsContent, 'utf8');
        console.log(`Successfully updated: ${DATA_JS}`);
        console.log('--- Books Sync Finished Successfully ---');
    } catch (err) {
        console.error('Error during books sync:', err.message || err);
        process.exit(1);
    }
}

syncBooks();

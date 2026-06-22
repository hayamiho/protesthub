const fs = require('fs');
const path = require('path');
const https = require('https');

// 設定
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8IR9EdM--8S590YqbE7jaUHWDb8lTR86ErcMpW0HS3c3OoCSrdZpX64Pk7wYkGQqxSKxWxzEE1MSa/pub?gid=0&single=true&output=csv';
const DATA_JSON = path.join(__dirname, 'data.json');
const DATA_JS = path.join(__dirname, 'data.js');

function downloadCsv(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // リダイレクト追従
                return resolve(downloadCsv(res.headers.location));
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

function parseCsv(csv) {
    const results = [];
    let currentField = '';
    let inQuotes = false;
    let currentRow = [];

    // 改行コードの正規化
    const content = csv.replace(/\r\n/g, '\n');

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // 二重クォートのエスケープ
                currentField += '"';
                i++;
            } else if (char === '"') {
                // クォート終了
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                // クォート開始
                inQuotes = true;
            } else if (char === ',') {
                // フィールド区切り
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                // 行区切り
                currentRow.push(currentField);
                results.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    // 最終行の処理
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        results.push(currentRow);
    }

    if (results.length === 0) return [];

    const headers = results[0];
    const data = [];
    for (let i = 1; i < results.length; i++) {
        const row = results[i];
        if (row.length === 1 && !row[0]) continue; // 空行スキップ

        const entry = {};
        headers.forEach((h, index) => {
            let val = (row[index] || '').trim();
            // タグは配列に変換
            if (h === 'tags') {
                val = val.split(',').map(t => t.trim()).filter(t => t);
            }
            entry[headers[index]] = val;
        });
        data.push(entry);
    }
    return data;
}

async function sync() {
    console.log('--- Database Sync Started ---');
    try {
        console.log('Fetching CSV from Google Sheets...');
        const csv = await downloadCsv(CSV_URL);
        const data = parseCsv(csv);

        // data.json の更新
        fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 4), 'utf8');
        console.log(`Updated: ${DATA_JSON}`);

        // data.js の更新 (CORS対策用)
        const jsContent = `const POSTERS_DATA = ${JSON.stringify(data, null, 4)};`;
        fs.writeFileSync(DATA_JS, jsContent, 'utf8');
        console.log(`Updated: ${DATA_JS}`);

        console.log('--- Sync Finished Successfully ---');
    } catch (err) {
        console.error('Error during sync:', err);
        process.exit(1);
    }
}

sync();

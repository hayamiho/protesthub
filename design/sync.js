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
    const lines = csv.split(/\r?\n/);
    const headers = lines[0].split(',');
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;

        // カンマ区切りのパース（簡易版：クォート内のカンマに対応）
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let char of lines[i]) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        const entry = {};
        headers.forEach((h, index) => {
            let val = values[index] || '';
            // タグは配列に変換
            if (h === 'tags') {
                val = val.split(',').map(t => t.trim()).filter(t => t);
            }
            entry[h] = val;
        });
        results.push(entry);
    }
    return results;
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

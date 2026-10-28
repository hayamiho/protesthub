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
    console.log('[NOTE] Googleスプレッドシートの「ウェブに公開」には最大5〜10分のキャッシュ遅延があります。');
    console.log('       更新直後に実行した場合、最新のデータが反映されていない場合があります。');
    console.log('');
    try {
        console.log('Fetching CSV from Google Sheets...');
        const csv = await downloadCsv(CSV_URL);
        const data = parseCsv(csv);

        console.log(`Downloaded ${data.length} records.`);
        if (data.length > 0) {
            const files = data.map(item => item.file).filter(Boolean);
            console.log(`Latest file in sync: ${files[files.length - 1]}`);
        }

        // data.json の更新
        fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 4), 'utf8');
        console.log(`Updated: ${DATA_JSON}`);

        // data.js の更新 (CORS対策用)
        const singlePageHelper = `
// 個別デザインページ（pl-*.html / fl-*.html）向けのバリエーション・他作品リスト一括制御
(function () {
    const variantsSection = document.getElementById('variants-section');
    const authorSection = document.getElementById('author-section');
    if (!variantsSection || !authorSection) return;

    const fileEl = document.querySelector('.panel .file');
    if (!fileEl) return;

    const currentFile = fileEl.textContent.trim();
    const currentPoster = POSTERS_DATA.find(p => p.file === currentFile);
    const currentTitle = currentPoster ? currentPoster.title : (document.querySelector('.panel .title')?.textContent.trim() || '');
    const creatorEl = document.querySelector('.panel .creator-link');
    const currentBy = (currentPoster && currentPoster.by) ? currentPoster.by : (creatorEl ? creatorEl.textContent.trim().replace(/^@/, '') : '');
    const currentIdMatch = currentFile.match(/([a-z]{2}-\\d{6})/i);
    const currentId = currentIdMatch ? currentIdMatch[1] : currentFile;

    const toWebp = (filename) => filename.replace(/\\.[^/.]+$/, ".webp");
    const AUTHOR_PAGES = ['protesthub_jp', 'indigorosa33'];

    // 1. バリエーション（同じIDシリーズ かつ 同じタイトル）
    const variants = POSTERS_DATA.filter(p => {
        const m = p.file.match(/([a-z]{2}-\\d{6})/i);
        const pId = m ? m[1] : p.file;
        return pId === currentId && p.title === currentTitle && p.file !== currentFile;
    });

    const variantList = document.getElementById('variant-list');
    if (variantList) {
        variantList.innerHTML = '';
        if (variants.length > 0) {
            variants.forEach(v => {
                const a = document.createElement('a');
                a.href = v.file.replace(/\\.[^/.]+$/, "") + ".html";
                a.innerHTML = \`<img src="images/\${toWebp(v.file)}" class="variant-thumb" alt="\${v.title}" loading="lazy">\`;
                variantList.appendChild(a);
            });
            variantsSection.style.display = 'block';
        } else {
            variantsSection.style.display = 'none';
        }
    }

    // 2. 作者の他作品（ID＋タイトルで重複排除し、全件をスクロール枠内に表示）
    const currentDesignKey = \`\${currentId}__\${currentTitle}\`;
    const sameAuthor = POSTERS_DATA.filter(p => p.by === currentBy);
    const uniqueAuthorWorks = [];
    const seenKeys = new Set([currentDesignKey]);

    sameAuthor.forEach(p => {
        const m = p.file.match(/([a-z]{2}-\\d{6})/i);
        const id = m ? m[1] : p.file;
        const key = \`\${id}__\${p.title || ''}\`;
        if (!seenKeys.has(key)) {
            uniqueAuthorWorks.push(p);
            seenKeys.add(key);
        }
    });

    const authorList = document.getElementById('author-list');
    const authorTitle = document.getElementById('author-title');
    if (authorList) {
        authorList.innerHTML = '';
        if (uniqueAuthorWorks.length > 0) {
            if (authorTitle) {
                if (AUTHOR_PAGES.includes(currentBy)) {
                    authorTitle.innerHTML = \`<a href="\${currentBy}.html" class="author-page-link">@\${currentBy}の作品一覧</a>\`;
                } else {
                    authorTitle.textContent = \`@\${currentBy}の作品一覧\`;
                }
            }
            uniqueAuthorWorks.forEach(v => {
                const a = document.createElement('a');
                a.href = v.file.replace(/\\.[^/.]+$/, "") + ".html";
                a.innerHTML = \`<img src="images/\${toWebp(v.file)}" class="variant-thumb" alt="\${v.title}" loading="lazy">\`;
                authorList.appendChild(a);
            });
            authorSection.style.display = 'block';
        } else {
            authorSection.style.display = 'none';
        }
    }

    // 各HTML内の古いインライン initLists() による上書き・重複読み込みを防止
    POSTERS_DATA.filter = () => [];
})();`;
        const jsContent = `const POSTERS_DATA = ${JSON.stringify(data, null, 4)};\n${singlePageHelper}\n`;
        fs.writeFileSync(DATA_JS, jsContent, 'utf8');
        console.log(`Updated: ${DATA_JS}`);

        console.log('--- Sync Finished Successfully ---');
    } catch (err) {
        console.error('Error during sync:', err);
        process.exit(1);
    }
}

sync();

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');
const { exec } = require('child_process');

const PORT = 3000;
const BOOKS_DIR = __dirname;
const IMAGES_DIR = path.join(BOOKS_DIR, 'images');
const DATA_JS_PATH = path.join(BOOKS_DIR, 'data_books.js');

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 1. 版元・OpenBDデータ取得 API
    if (pathname === '/api/hanmoto' && req.method === 'GET') {
        const inputUrl = parsedUrl.query.url;
        if (!inputUrl) {
            return sendJson(res, 400, { error: 'URLが指定されていません。' });
        }

        const isbnMatch = inputUrl.match(/978\d{10}/);
        if (!isbnMatch) {
            return sendJson(res, 400, { error: 'URLから13桁のISBN(978...)を抽出できませんでした。' });
        }

        const isbn = isbnMatch[0];
        try {
            const bookData = await fetchBookDataByIsbn(isbn, inputUrl);

            // 書影画像のダウンロード・保存処理
            const imgFileName = `${isbn}.png`;
            const imgPath = path.join(IMAGES_DIR, imgFileName);

            let downloadSuccess = false;
            const candidates = [
                bookData.coverUrl,
                `https://www.hanmoto.com/bd/img/${isbn}_600.jpg`,
                `https://www.hanmoto.com/bd/img/${isbn}.jpg`,
                `https://cover.openbd.jp/${isbn}.jpg`
            ].filter(Boolean);

            for (const imgCandidate of candidates) {
                try {
                    await downloadImage(imgCandidate, imgPath);
                    if (fs.existsSync(imgPath) && fs.statSync(imgPath).size > 100) {
                        downloadSuccess = true;
                        break;
                    } else if (fs.existsSync(imgPath)) {
                        fs.unlinkSync(imgPath); // 0KBなどの不正ファイルを削除
                    }
                } catch (e) {
                    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
                }
            }

            bookData.file = downloadSuccess ? imgFileName : `${isbn}.png`;
            bookData.imageSuccess = downloadSuccess;
            delete bookData.coverUrl;

            return sendJson(res, 200, bookData);
        } catch (err) {
            console.error('版元データ取得エラー:', err);
            return sendJson(res, 500, { error: `情報取得に失敗しました: ${err.message}` });
        }
    }

    // 2. 書籍データ一覧取得 API
    if (pathname === '/api/books' && req.method === 'GET') {
        try {
            const books = loadBooksData();
            return sendJson(res, 200, { books });
        } catch (err) {
            return sendJson(res, 500, { error: err.message });
        }
    }

    // 3. 書籍データ保存・更新 API
    if (pathname === '/api/save_book' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const books = loadBooksData();

            const index = books.findIndex(b =>
                (b.file && body.file && b.file === body.file) ||
                (b.hanmoto && body.hanmoto && extractIsbn(b.hanmoto) === extractIsbn(body.hanmoto))
            );

            const newBook = formatBookEntry(body);

            if (index >= 0) {
                books[index] = { ...books[index], ...newBook };
            } else {
                books.unshift(newBook);
            }

            saveBooksData(books);
            return sendJson(res, 200, { success: true, isUpdate: index >= 0, book: newBook, booksCount: books.length });
        } catch (err) {
            console.error('保存エラー:', err);
            return sendJson(res, 500, { error: `保存処理に失敗しました: ${err.message}` });
        }
    }

    // 4. データ同期・バッチ実行 API
    if (pathname === '/api/run_sync' && req.method === 'POST') {
        exec('node sync_books.js', { cwd: BOOKS_DIR }, (error, stdout, stderr) => {
            if (error) {
                return sendJson(res, 500, { error: stderr || error.message });
            }
            return sendJson(res, 200, { success: true, output: stdout });
        });
        return;
    }

    // 静的ファイル配信
    let filePath = path.join(BOOKS_DIR, pathname === '/' ? 'admin.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(BOOKS_DIR, 'admin.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch (e) {
                reject(new Error('無効なJSONフォーマットです'));
            }
        });
        req.on('error', reject);
    });
}

function extractIsbn(str) {
    const match = (str || '').match(/978\d{10}/);
    return match ? match[0] : '';
}

function loadBooksData() {
    if (!fs.existsSync(DATA_JS_PATH)) return [];
    const content = fs.readFileSync(DATA_JS_PATH, 'utf8');
    const match = content.match(/const\s+BOOKS_DATA\s*=\s*([\s\S]*?);?\s*$/);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]);
        } catch (e) { }
    }
    return [];
}

function saveBooksData(books) {
    const content = `// ProtestHub Books Master Data (Synced from Google Sheets / Admin Tool)
const BOOKS_DATA = ${JSON.stringify(books, null, 4)};
`;
    fs.writeFileSync(DATA_JS_PATH, content, 'utf8');
}

function formatBookEntry(data) {
    const entry = {
        file: data.file || `${extractIsbn(data.hanmoto || '')}.png`,
        title: (data.title || '').trim(),
        author: formatAuthor((data.author || '').trim()),
        pub: formatPub((data.pub || '').trim()),
        desc: (data.desc || '').trim(),
        amzn: (data.amzn || '').trim(),
        hanmoto: (data.hanmoto || '').trim()
    };
    for (let i = 1; i <= 10; i++) {
        entry[`tw${i}`] = (data[`tw${i}`] || '').trim();
    }
    return entry;
}

// 著者名の整形（全角スペースを半角へ、全角かっこを半角へ統一。カタカナルビ等の除去・役割表示(著)などを保持）
function formatAuthor(authorStr) {
    if (!authorStr) return '';
    let formatted = authorStr
        .replace(/（/g, '(').replace(/）/g, ')')
        .replace(/／/g, '/')
        .replace(/　/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // カタカナルビの除去 (例: 「岡 真理 (オカ マリ)(著)」 -> 「岡 真理(著)」)
    formatted = formatted.replace(/\s*\([\u30A0-\u30FF\s]+\)/g, '');

    // スラッシュ区切りの整形
    formatted = formatted.replace(/\s*\/\s*(著|訳|絵|編|解説|監修)/g, '($1)');
    formatted = formatted.replace(/\)\s+/g, ')、');

    // 役割カッコが無ければ (著) を補正
    if (!/\((著|訳|絵|編|解説|監修)\)/.test(formatted) && formatted.length > 0) {
        formatted += '(著)';
    }

    return formatted;
}

// 出版社名の整形（「発行：」「発売：」などの接頭語を除去）
function formatPub(pubStr) {
    if (!pubStr) return '';
    return pubStr
        .replace(/^(発行|発売|発行所|発売所|出版)[:：\s]*/g, '')
        .replace(/　/g, ' ')
        .trim();
}

function formatTitle(titleStr) {
    if (!titleStr) return '';
    let formatted = titleStr
        .replace(/（/g, '(').replace(/）/g, ')')
        .replace(/\|\s*版元ドットコム.*/i, '')
        .trim();

    // タイトルのカッコ内ルビ（カタカナ・ひらがな）を除去 (例: 「増補版 ガザとは何か (ゾウホバンガザトハナニカ)」 -> 「増補版 ガザとは何か」)
    formatted = formatted.replace(/\s*\([\u3040-\u30FF\s]+\)/g, '');
    return formatted.trim();
}

// openBD & 版元ドットコムスクレイピング
async function fetchBookDataByIsbn(isbn, originalHanmotoUrl) {
    const hanmotoUrl = `https://www.hanmoto.com/bd/isbn/${isbn}`;
    let htmlText = '';
    try {
        htmlText = await fetchUrl(hanmotoUrl);
    } catch (e) {
        console.warn('版元ドットコムHTML取得警告:', e.message);
    }

    let title = '';
    let author = '';
    let pub = '';
    let desc = '';
    let hasDesc = true;
    let coverUrl = `https://img.hanmoto.com/bd/img/${isbn}_600.jpg`;

    // 1. 版元ドットコム HTML から優先抽出
    if (htmlText) {
        const parsed = parseHanmotoHtml(htmlText);
        title = parsed.title;
        author = parsed.author;
        pub = parsed.pub;
        desc = parsed.desc;
        hasDesc = parsed.hasDescClass;
        if (parsed.coverUrl) coverUrl = parsed.coverUrl;
    }

    // 2. 補足：OpenBD API からの取得（不足項目のカバー）
    try {
        const openBDUrl = `https://api.openbd.jp/v1/get?isbn=${isbn}`;
        const resText = await fetchUrl(openBDUrl);
        const parsed = JSON.parse(resText);
        if (parsed && parsed[0] && parsed[0].summary) {
            const sum = parsed[0].summary;
            if (!title) title = sum.title || '';
            if (!author) author = sum.author || '';
            if (!pub) pub = sum.publisher || '';
            if (!desc && parsed[0].onix?.CollateralDetail?.TextContent) {
                const tc = parsed[0].onix.CollateralDetail.TextContent.find(t => t.Text) || parsed[0].onix.CollateralDetail.TextContent[0];
                if (tc && tc.Text) {
                    desc = tc.Text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
                }
            }
        }
    } catch (e) { }

    title = formatTitle(title);

    if (!desc) {
        hasDesc = false;
        desc = '※紹介文が見つかりませんでした。手動で入力してください。';
    }

    // Amazon検索URLの生成 (指定キーワード検索)
    const amzn = `https://www.amazon.co.jp/s?k=${encodeURIComponent(title || isbn)}`;

    return {
        isbn,
        title,
        author: formatAuthor(author),
        pub: formatPub(pub),
        desc: desc.trim(),
        hasDesc,
        amzn,
        hanmoto: originalHanmotoUrl || hanmotoUrl,
        coverUrl
    };
}

function parseHanmotoHtml(html) {
    let title = '';
    let author = '';
    let pub = '';
    let desc = '';
    let hasDescClass = true;
    let coverUrl = '';

    // タイトル <h1 class="book-title">...</h1> や <title>
    const titleMatch = html.match(/<h1[^>]*class="[^"]*book-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
        html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // 著者 <div class="book-authors">...</div>
    const authorMatch = html.match(/<div[^>]*class="[^"]*book-authors[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (authorMatch) {
        author = authorMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    // 出版社 <div class="book-publishers">...</div>
    const pubMatch = html.match(/<div[^>]*class="[^"]*book-publishers[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (pubMatch) {
        pub = pubMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    // 紹介文 <p class="book-info-more" ...> や <div class="book-description"> など
    const descMatch = html.match(/<p[^>]*class="[^"]*book-info-more[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
        html.match(/<div[^>]*class="[^"]*book-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        html.match(/<[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (descMatch) {
        desc = descMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    } else {
        hasDescClass = false;
    }

    // 高画質書影画像 (img.hanmoto.com を優先)
    const imgMatch = html.match(/<img[^>]*src="([^"]*hanmoto\.com\/bd\/img\/[^"]+)"/i) ||
        html.match(/<img[^>]*class="[^"]*book-cover[^"]*"[^>]*src="([^"]+)"/i);
    if (imgMatch) {
        coverUrl = imgMatch[1];
        if (coverUrl.startsWith('//')) coverUrl = 'https:' + coverUrl;
        else if (coverUrl.startsWith('/')) coverUrl = 'https://www.hanmoto.com' + coverUrl;

        // 600px 高画質版にURLを置換
        if (!coverUrl.includes('_600')) {
            coverUrl = coverUrl.replace(/(\.(jpg|png|webp))/i, '_600$1');
        }
        coverUrl = coverUrl.replace('www.hanmoto.com', 'img.hanmoto.com');
    }

    return { title, author, pub, desc, hasDescClass, coverUrl };
}

function fetchUrl(targetUrl) {
    return new Promise((resolve, reject) => {
        const req = https.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let loc = res.headers.location;
                if (loc.startsWith('/')) loc = 'https://www.hanmoto.com' + loc;
                return resolve(fetchUrl(loc));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
    });
}

function downloadImage(imgUrl, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const req = https.get(imgUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let loc = res.headers.location;
                if (loc.startsWith('/')) loc = 'https://www.hanmoto.com' + loc;
                return resolve(downloadImage(loc, destPath));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`画像取得エラー: HTTP ${res.statusCode}`));
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(destPath));
            });
        });
        req.on('error', err => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` ProtestHub 書籍管理Webツールが起動しました！`);
    console.log(` ブラウザで http://localhost:3000/ にアクセスしてください`);
    console.log(`==================================================`);
});

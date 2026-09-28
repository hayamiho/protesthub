const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data_books.js');
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const OUTPUT_DIR = __dirname; // books/ 直下

function extractIsbn(str) {
    const match = (str || '').match(/978\d{10}/);
    return match ? match[0] : '';
}

function getTweetId(urlStr) {
    if (!urlStr) return null;
    const match = urlStr.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
}

function generate() {
    console.log('--- Books HTML Generation Started ---');

    if (!fs.existsSync(DATA_FILE)) {
        console.error('Error: data_books.js not found');
        return;
    }
    const dataJsContent = fs.readFileSync(DATA_FILE, 'utf8');
    const dataMatch = dataJsContent.match(/const\s+BOOKS_DATA\s*=\s*([\s\S]*?);?\s*$/);
    if (!dataMatch || !dataMatch[1]) {
        console.error('Error: Failed to parse BOOKS_DATA from data_books.js');
        return;
    }

    let booksData = [];
    try {
        booksData = JSON.parse(dataMatch[1]);
    } catch (e) {
        console.error('Error parsing JSON from data_books.js:', e.message);
        return;
    }

    if (!fs.existsSync(TEMPLATE_FILE)) {
        console.error('Error: template.html not found');
        return;
    }
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

    const stripTags = (str) => (str || '').replace(/<[^>]*>?/gm, '');
    const escapeJs = (str) => (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');

    let count = 0;
    booksData.forEach((book, idx) => {
        const rawFile = book.file || extractIsbn(book.hanmoto || '');
        const cleanIsbn = rawFile.replace(/\.(png|jpg|jpeg|webp)$/i, '').trim();
        if (!cleanIsbn) {
            console.warn(`[Skip] Missing ISBN for book index ${idx}: ${book.title}`);
            return;
        }

        const title = book.title || '';
        const author = book.author || '';
        const pub = book.pub || book.publisher || '';
        const desc = book.desc || book.description || '';
        const amzn = book.amzn || book.amazon_url || '#';
        const hanmoto = book.hanmoto || '#';

        let metaStr = '';
        if (author && pub) {
            metaStr = `${author} ／ ${pub}`;
        } else {
            metaStr = author || pub || '';
        }

        // ツイート配列の収集
        let tweets = [];
        if (book.tweets && Array.isArray(book.tweets)) {
            tweets = book.tweets;
        } else {
            const twKeys = Object.keys(book)
                .filter(k => /^(tw|ツイート)\d+$/i.test(k))
                .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));

            twKeys.forEach(k => {
                if (book[k] && book[k].trim()) tweets.push(book[k].trim());
            });
            tweets.reverse(); // 新しい順
        }

        let tweetsHtml = '';
        if (tweets.length > 0) {
            tweetsHtml = tweets.map(twUrl => {
                const tweetId = getTweetId(twUrl);
                return `<div class="tweet-embed-item" data-tweet-id="${tweetId || ''}" data-tweet-url="${twUrl}"></div>`;
            }).join('\n');
        } else {
            tweetsHtml = '';
        }

        const outputFileName = `${cleanIsbn}.html`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);

        let content = template;
        const replacements = {
            '{{TITLE}}': title,
            '{{META}}': metaStr,
            '{{DESC}}': desc,
            '{{ISBN}}': cleanIsbn,
            '{{AMAZON_URL}}': amzn,
            '{{HANMOTO_URL}}': hanmoto,
            '{{TWEETS_HTML}}': tweetsHtml,
            '{{OG_TITLE}}': stripTags(title),
            '{{OG_DESC}}': stripTags(desc).substring(0, 120),
            '{{JS_TITLE}}': escapeJs(title)
        };

        Object.keys(replacements).forEach(placeholder => {
            content = content.split(placeholder).join(replacements[placeholder]);
        });

        fs.writeFileSync(outputPath, content, 'utf8');
        count++;
        console.log(`[${count}/${booksData.length}] Generated: ${outputFileName}`);
    });

    console.log(`\n--- Finished! Total ${count} HTML files generated successfully. ---`);
}

generate();

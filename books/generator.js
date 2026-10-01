const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA_FILE = path.join(__dirname, 'data_books.js');
const TWEETS_FILE = path.join(__dirname, 'data_tweets.js');
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const OUTPUT_DIR = __dirname; // books/ 直下

function extractIsbn(str) {
    const match = (str || '').match(/978\d{10}/);
    return match ? match[0] : '';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getTweetUserInfo(twUrl) {
    if (!twUrl) return { username: 'x_user', tweetId: '' };
    const match = twUrl.match(/(?:twitter|x)\.com\/([^\/]+)\/status\/(\d+)/i);
    if (match) {
        return { username: match[1], tweetId: match[2] };
    }
    return { username: 'x_user', tweetId: '' };
}

function createTweetCardHtml(twUrl, tweetsCache) {
    const info = getTweetUserInfo(twUrl);
    const tweetId = info.tweetId;
    const cached = tweetId ? tweetsCache[tweetId] : null;

    const authorName = escapeHtml(cached && cached.author_name ? cached.author_name : `@${info.username}`);
    const screenName = escapeHtml(cached && cached.screen_name ? cached.screen_name : info.username);
    const avatarUrl = cached && cached.avatar_url ? cached.avatar_url : '';
    const tweetText = escapeHtml(cached && cached.text ? cached.text : '#反戦読書部 で共有されたポストを見る');

    const avatarHtml = avatarUrl
        ? `<img class="tt-avatar-img" src="${avatarUrl}" alt="${authorName}" onerror="this.style.display='none'">`
        : `<div class="tt-avatar-img" style="display:flex;align-items:center;justify-content:center;background:#1d9bf0;color:#fff;font-weight:bold;font-size:14px;">${screenName.charAt(0).toUpperCase()}</div>`;

    let mediaHtml = '';
    if (cached && cached.photos && cached.photos.length > 0) {
        const imgTags = cached.photos.map(pUrl => `<img class="tt-media-img" src="${pUrl}" alt="ツイート添付画像" loading="lazy">`).join('');
        mediaHtml = `<div class="tt-media-grid">${imgTags}</div>`;
    }

    let quoteHtml = '';
    if (cached && cached.quote) {
        const q = cached.quote;
        const qAuthorName = escapeHtml(q.author_name || `@${q.screen_name}`);
        const qScreenName = escapeHtml(q.screen_name || '');
        const qAvatarUrl = q.avatar_url || '';
        const qText = escapeHtml(q.text || '');

        const qAvatarHtml = qAvatarUrl
            ? `<img class="tt-quote-avatar" src="${qAvatarUrl}" alt="${qAuthorName}" onerror="this.style.display='none'">`
            : `<div class="tt-quote-avatar" style="display:flex;align-items:center;justify-content:center;background:#1d9bf0;color:#fff;font-weight:bold;font-size:10px;">${qScreenName.charAt(0).toUpperCase()}</div>`;

        let qMediaHtml = '';
        if (q.photos && q.photos.length > 0) {
            const qImgTags = q.photos.map(pUrl => `<img class="tt-quote-media-img" src="${pUrl}" alt="引用ツイート添付画像" loading="lazy">`).join('');
            qMediaHtml = `<div class="tt-quote-media-grid">${qImgTags}</div>`;
        }

        quoteHtml = `
                        <div class="tt-quote-card">
                            <div class="tt-quote-header">
                                ${qAvatarHtml}
                                <span class="tt-quote-author">${qAuthorName}</span>
                                <span class="tt-quote-username">@${qScreenName}</span>
                            </div>
                            <p class="tt-quote-text">${qText}</p>
                            ${qMediaHtml}
                        </div>`;
    }

    let dateStr = '';
    if (cached && cached.created_at) {
        try {
            const d = new Date(cached.created_at);
            if (!isNaN(d.getTime())) {
                dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
            }
        } catch (e) { }
    }

    return `                        <a class="togetter-tweet-card" href="${twUrl}" target="_blank" rel="noopener noreferrer" aria-label="@${screenName} のXポストを開く">
                            <div class="tt-header">
                                <div class="tt-user-container">
                                    ${avatarHtml}
                                    <div class="tt-user-info">
                                        <span class="tt-author-name">${authorName}</span>
                                        <span class="tt-username">@${screenName}</span>
                                    </div>
                                </div>
                                <span class="tt-badge">Xで開く ↗</span>
                            </div>
                            <div class="tt-body">
                                <p class="tt-text">${tweetText}</p>
                                ${mediaHtml}
                                ${quoteHtml}
                            </div>
                            <div class="tt-footer">
                                <span class="tt-date">${dateStr}</span>
                            </div>
                        </a>`;
}

function generate() {
    console.log('--- Books HTML Generation Started ---');

    if (!fs.existsSync(DATA_FILE)) {
        console.error('Error: data_books.js not found');
        return;
    }

    // Load TWEETS_CACHE
    let tweetsCache = {};
    if (fs.existsSync(TWEETS_FILE)) {
        try {
            let dataTweetsContent = fs.readFileSync(TWEETS_FILE, 'utf8').replace('const TWEETS_CACHE =', 'var TWEETS_CACHE =');
            const tweetsContext = {};
            vm.createContext(tweetsContext);
            vm.runInContext(dataTweetsContent, tweetsContext);
            tweetsCache = tweetsContext.TWEETS_CACHE || {};
        } catch (e) {
            console.warn('Warning loading data_tweets.js:', e.message);
        }
    }

    // Load BOOKS_DATA
    let dataJsContent = fs.readFileSync(DATA_FILE, 'utf8').replace('const BOOKS_DATA =', 'var BOOKS_DATA =');
    const booksContext = {};
    vm.createContext(booksContext);
    vm.runInContext(dataJsContent, booksContext);
    const booksData = booksContext.BOOKS_DATA || [];

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
        }

        // 投稿日時が新しい順（降順）にソート
        tweets.sort((aUrl, bUrl) => {
            const aInfo = getTweetUserInfo(aUrl);
            const bInfo = getTweetUserInfo(bUrl);
            const aCached = aInfo.tweetId ? tweetsCache[aInfo.tweetId] : null;
            const bCached = bInfo.tweetId ? tweetsCache[bInfo.tweetId] : null;

            const aTime = (aCached && aCached.created_at) ? new Date(aCached.created_at).getTime() : 0;
            const bTime = (bCached && bCached.created_at) ? new Date(bCached.created_at).getTime() : 0;

            return bTime - aTime; // 新しい順
        });

        let tweetsHtml = '';
        if (tweets.length > 0) {
            tweetsHtml = tweets.map(twUrl => createTweetCardHtml(twUrl, tweetsCache)).join('\n');
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
    });

    console.log(`\n--- Finished! Total ${count} HTML files generated successfully. ---`);
}

generate();

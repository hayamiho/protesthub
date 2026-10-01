const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const dataBooksPath = path.join(__dirname, 'data_books.js');
const dataTweetsPath = path.join(__dirname, 'data_tweets.js');

if (!fs.existsSync(dataBooksPath)) {
    console.error('Error: data_books.js not found.');
    process.exit(1);
}

// 1. Read BOOKS_DATA
let dataBooksContent = fs.readFileSync(dataBooksPath, 'utf8').replace('const BOOKS_DATA =', 'var BOOKS_DATA =');
const booksContext = {};
vm.createContext(booksContext);
vm.runInContext(dataBooksContent, booksContext);
const books = booksContext.BOOKS_DATA || [];

// 2. Read existing TWEETS_CACHE if present
let tweetsCache = {};
if (fs.existsSync(dataTweetsPath)) {
    try {
        let dataTweetsContent = fs.readFileSync(dataTweetsPath, 'utf8').replace('const TWEETS_CACHE =', 'var TWEETS_CACHE =');
        const tweetsContext = {};
        vm.createContext(tweetsContext);
        vm.runInContext(dataTweetsContent, tweetsContext);
        tweetsCache = tweetsContext.TWEETS_CACHE || {};
    } catch (e) {
        console.warn('Warning loading existing data_tweets.js:', e.message);
    }
}

// 3. Extract unique tweet URLs
const tweetMap = new Map(); // id -> url
books.forEach(b => {
    Object.keys(b).forEach(k => {
        if (/^(tw|ツイート)\d+$/i.test(k) && b[k] && b[k].trim()) {
            const url = b[k].trim();
            const match = url.match(/\/status\/(\d+)/i);
            if (match) {
                tweetMap.set(match[1], url);
            }
        }
    });
});

console.log(`Found ${tweetMap.size} total tweet URLs in data_books.js.`);

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`JSON parse error: ${e.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function fetchTweetData(tweetId, tweetUrl) {
    try {
        const data = await fetchJson(`https://api.fxtwitter.com/status/${tweetId}`);
        if (data && data.tweet) {
            const tw = data.tweet;
            return {
                id: tweetId,
                url: tweetUrl,
                text: tw.text || '',
                author_name: tw.author ? tw.author.name : '',
                screen_name: tw.author ? tw.author.screen_name : '',
                avatar_url: tw.author ? (tw.author.avatar_url || '') : '',
                created_at: tw.created_at || '',
                photos: tw.media && tw.media.photos ? tw.media.photos.map(p => p.url) : []
            };
        }
    } catch (e) {
        console.warn(`Failed to fetch tweet ${tweetId}: ${e.message}`);
    }

    const match = tweetUrl.match(/(?:twitter|x)\.com\/([^\/]+)\/status\/(\d+)/i);
    return {
        id: tweetId,
        url: tweetUrl,
        text: 'ポストを表示する（Xで開く）',
        author_name: match ? match[1] : 'X User',
        screen_name: match ? match[1] : 'x_user',
        avatar_url: '',
        created_at: '',
        photos: []
    };
}

async function run() {
    const newTweetEntries = [];
    tweetMap.forEach((url, id) => {
        // Fetch if missing or text is fallback dummy
        if (!tweetsCache[id] || tweetsCache[id].text === 'ポストを表示する（Xで開く）') {
            newTweetEntries.push([id, url]);
        }
    });

    if (newTweetEntries.length === 0) {
        console.log('All tweets are already cached in data_tweets.js.');
        return;
    }

    console.log(`Fetching ${newTweetEntries.length} new or uncached tweet(s)...`);

    for (let i = 0; i < newTweetEntries.length; i++) {
        const [id, url] = newTweetEntries[i];
        console.log(`[${i + 1}/${newTweetEntries.length}] Fetching status ${id}...`);
        const tweetObj = await fetchTweetData(id, url);
        tweetsCache[id] = tweetObj;
        await new Promise(r => setTimeout(r, 120));
    }

    const jsContent = `// ProtestHub Tweets Cache Data\nconst TWEETS_CACHE = ${JSON.stringify(tweetsCache, null, 4)};\n`;
    fs.writeFileSync(dataTweetsPath, jsContent, 'utf8');

    console.log(`Updated data_tweets.js successfully! (Total ${Object.keys(tweetsCache).length} items)`);
}

run();

/**
 * ProtestHub /books/ スクリプト
 */

// SNSシェア時のハッシュタグ設定
// --------------------------------------------------------------------------
// ※ 期間終了後（例: 9/23以降）は、以下の配列から不要なタグを削除・コメントアウトしてください。
const SHARE_HASHTAGS = [
    '#反戦読書部'
];
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const wallEl = document.getElementById('book-wall');
    const searchInput = document.getElementById('search');
    const sortSelect = document.getElementById('sort');

    // Modal elements
    const modalEl = document.getElementById('modal');
    const closeBtn = document.getElementById('close-btn');
    const modalPanel = document.querySelector('.modal-panel');
    const modalLeft = document.querySelector('.modal-left');
    const modalRight = document.querySelector('.modal-right');

    const modalCover = document.getElementById('modal-cover');
    const modalTitle = document.getElementById('modal-title');
    const modalMeta = document.getElementById('modal-meta');

    const descriptionWrap = document.getElementById('description-wrap');
    const modalDescription = document.getElementById('modal-description');
    const readMoreBtn = document.getElementById('read-more-btn');

    const modalTweetsContainer = document.getElementById('modal-tweets');
    const modalAmazonLink = document.getElementById('modal-amazon-link');
    const modalShareX = document.getElementById('modal-share-x');

    // 配列のシャッフル関数 (Fisher-Yates)
    function shuffleArray(array) {
        const copy = [...array];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    let tweetObserver = null;

    // Helper: Book object property resolver
    function resolveBook(book) {
        // Image path (.webp 対応 & 13桁ISBN正規化)
        let rawImg = book.file || book.image || '';
        let cleanFileName = rawImg.replace(/\.(png|jpg|jpeg|webp)$/i, '').trim();
        let img = '';
        if (rawImg.startsWith('http') || rawImg.startsWith('/') || rawImg.startsWith('./') || rawImg.startsWith('../')) {
            img = rawImg;
        } else if (cleanFileName) {
            img = 'images/' + cleanFileName + '.webp';
        }

        // Tweets array (tw1 ~ twN 動的対応)
        let tweets = book.tweets;
        if (!tweets) {
            tweets = [];
            const twKeys = Object.keys(book)
                .filter(k => /^(tw|ツイート)\d+$/i.test(k))
                .sort((a, b) => {
                    const numA = parseInt(a.replace(/\D/g, ''), 10);
                    const numB = parseInt(b.replace(/\D/g, ''), 10);
                    return numA - numB;
                });

            twKeys.forEach(k => {
                const tw = book[k];
                if (tw && tw.trim()) {
                    tweets.push(tw.trim());
                }
            });

            // 新しいツイートが一番上にくるように逆順（新しい順）にする
            tweets.reverse();
        }

        return {
            isbn: cleanFileName,
            title: book.title || '',
            author: book.author || '',
            publisher: book.publisher || book.pub || '',
            description: book.description || book.desc || '',
            image: img,
            amazon_url: book.amazon_url || book.amzn || '#',
            tweets: tweets
        };
    }

    // 列数の算出（books.cssのブレークポイントに準拠）
    function getColumnCount() {
        const width = window.innerWidth;
        if (width <= 768) return 3;
        if (width <= 992) return 4;
        if (width <= 1200) return 5;
        return 6;
    }

    // 書籍カードエレメント生成（クリック時に個別HTMLへ遷移）
    function createBookCard(book) {
        const card = document.createElement('article');
        card.className = 'book-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${book.title} の詳細を表示`);

        const targetUrl = book.isbn ? `${book.isbn}.html` : '#';

        card.innerHTML = `
            <a href="${targetUrl}" style="display: block; width: 100%; height: 100%; text-decoration: none; color: inherit;">
                <img src="${book.image}" alt="${book.title}" loading="lazy" onerror="this.src='../images/logo.png';">
            </a>
        `;

        card.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(book);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal(book);
            }
        });
        return card;
    }

    // Render Grid Wall (動的マルチカラムによるZ字配列)
    function renderWall(books) {
        const colsCount = getColumnCount();
        wallEl.innerHTML = '';
        if (books.length === 0) {
            wallEl.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--muted); font-weight: 700;">該当する書籍が見つかりませんでした。</div>';
            return;
        }

        const columns = [];
        for (let i = 0; i < colsCount; i++) {
            const col = document.createElement('div');
            col.className = 'wall-column';
            wallEl.appendChild(col);
            columns.push(col);
        }

        books.forEach((rawBook, index) => {
            const book = resolveBook(rawBook);
            const card = createBookCard(book);
            const targetCol = columns[index % colsCount];
            targetCol.appendChild(card);
        });
    }

    // ランダムソート順のセッション保持
    function getRandomOrderMap(forceNew = false) {
        let orderMap = null;
        if (!forceNew) {
            try {
                const stored = sessionStorage.getItem('books_random_order');
                if (stored) orderMap = JSON.parse(stored);
            } catch (e) { }
        }
        if (!orderMap || !Array.isArray(orderMap) || orderMap.length !== BOOKS_DATA.length) {
            const shuffled = shuffleArray([...BOOKS_DATA]);
            orderMap = shuffled.map(b => resolveBook(b).isbn);
            try {
                sessionStorage.setItem('books_random_order', JSON.stringify(orderMap));
            } catch (e) { }
        }
        return orderMap;
    }

    let currentFilteredBooks = [];

    // Filter & Sort (デフォルト: ランダム)
    function updateList() {
        const query = searchInput.value.trim().toLowerCase();
        const sortVal = sortSelect.value;

        let filtered = BOOKS_DATA.filter(rawBook => {
            const book = resolveBook(rawBook);
            if (!query) return true;
            return (
                book.title.toLowerCase().includes(query) ||
                book.author.toLowerCase().includes(query) ||
                book.publisher.toLowerCase().includes(query) ||
                (book.description && book.description.toLowerCase().includes(query))
            );
        });

        if (sortVal === 'random') {
            filtered = shuffleArray(filtered);
        } else if (sortVal === 'popular') {
            filtered.sort((a, b) => {
                const bA = resolveBook(a);
                const bB = resolveBook(b);
                return bB.tweets.length - bA.tweets.length;
            });
        } else if (sortVal === 'newest') {
            // スプレッドシートの登録順で末尾（最新）を先頭（左上）にするため逆順
            filtered.reverse();
        }

        currentFilteredBooks = filtered;
        renderWall(currentFilteredBooks);
    }

    // Extract Tweet ID from URL
    function getTweetId(urlStr) {
        if (!urlStr) return null;
        const match = urlStr.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    }

    // Extract User Info & Tweet ID from URL
    function getTweetUserInfo(twUrl) {
        if (!twUrl) return { username: 'x_user', tweetId: '' };
        const match = twUrl.match(/(?:twitter|x)\.com\/([^\/]+)\/status\/(\d+)/i);
        if (match) {
            return { username: match[1], tweetId: match[2] };
        }
        return { username: 'x_user', tweetId: '' };
    }

    // Modal Open
    function openModal(book) {
        // Reset scroll positions
        if (modalPanel) modalPanel.scrollTop = 0;
        if (modalRight) modalRight.scrollTop = 0;
        if (modalLeft) modalLeft.scrollTop = 0;

        // Disconnect previous tweet observer if any
        if (tweetObserver) {
            tweetObserver.disconnect();
            tweetObserver = null;
        }

        modalCover.src = book.image;
        modalCover.alt = book.title;
        modalTitle.textContent = book.title;

        // 著者 ／ 発行元 の1行フォーマット
        const authorStr = book.author || '';
        const publisherStr = book.publisher || '';
        if (authorStr && publisherStr) {
            modalMeta.textContent = `${authorStr} ／ ${publisherStr}`;
        } else {
            modalMeta.textContent = authorStr || publisherStr || '';
        }

        // 紹介文（1行表示 ＋ 右寄せ▼続きを読む）
        if (book.description && book.description.trim()) {
            descriptionWrap.style.display = 'flex';
            modalDescription.textContent = book.description;
            modalDescription.classList.add('clamp-1');
            readMoreBtn.textContent = '▼ 続きを読む';
            readMoreBtn.style.display = 'block';
        } else {
            descriptionWrap.style.display = 'none';
        }

        // 関連ポスト（Togetter風・本物ツイート内容完全再現超軽量HTMLカード）
        modalTweetsContainer.innerHTML = '';
        if (book.tweets && book.tweets.length > 0) {
            modalTweetsContainer.style.display = 'flex';

            book.tweets.forEach(twUrl => {
                const info = getTweetUserInfo(twUrl);
                const cached = (typeof TWEETS_CACHE !== 'undefined' && info.tweetId) ? TWEETS_CACHE[info.tweetId] : null;

                const card = document.createElement('a');
                card.className = 'togetter-tweet-card';
                card.href = twUrl;
                card.target = '_blank';
                card.rel = 'noopener noreferrer';

                const authorName = cached && cached.author_name ? cached.author_name : `@${info.username}`;
                const screenName = cached && cached.screen_name ? cached.screen_name : info.username;
                const avatarUrl = cached && cached.avatar_url ? cached.avatar_url : '';
                const tweetText = cached && cached.text ? cached.text : '#反戦読書部 で共有されたポストを見る';

                card.setAttribute('aria-label', `@${screenName} のXポストを開く`);

                // Avatar HTML
                const avatarHtml = avatarUrl
                    ? `<img class="tt-avatar-img" src="${avatarUrl}" alt="${authorName}" onerror="this.style.display='none'">`
                    : `<div class="tt-avatar-img" style="display:flex;align-items:center;justify-content:center;background:#1d9bf0;color:#fff;font-weight:bold;font-size:14px;">${screenName.charAt(0).toUpperCase()}</div>`;

                // Photos HTML
                let mediaHtml = '';
                if (cached && cached.photos && cached.photos.length > 0) {
                    const imgTags = cached.photos.map(pUrl => `<img class="tt-media-img" src="${pUrl}" alt="ツイート添付画像" loading="lazy">`).join('');
                    mediaHtml = `<div class="tt-media-grid">${imgTags}</div>`;
                }

                // Quote Tweet HTML
                let quoteHtml = '';
                if (cached && cached.quote) {
                    const q = cached.quote;
                    const qAuthorName = q.author_name || `@${q.screen_name}`;
                    const qScreenName = q.screen_name || '';
                    const qAvatarUrl = q.avatar_url || '';
                    const qText = q.text || '';

                    const qAvatarHtml = qAvatarUrl
                        ? `<img class="tt-quote-avatar" src="${qAvatarUrl}" alt="${qAuthorName}" onerror="this.style.display='none'">`
                        : `<div class="tt-quote-avatar" style="display:flex;align-items:center;justify-content:center;background:#1d9bf0;color:#fff;font-weight:bold;font-size:10px;">${qScreenName.charAt(0).toUpperCase()}</div>`;

                    let qMediaHtml = '';
                    if (q.photos && q.photos.length > 0) {
                        const qImgTags = q.photos.map(pUrl => `<img class="tt-quote-media-img" src="${pUrl}" alt="引用ツイート添付画像" loading="lazy">`).join('');
                        qMediaHtml = `<div class="tt-quote-media-grid">${qImgTags}</div>`;
                    }

                    const qTextP = document.createElement('p');
                    qTextP.className = 'tt-quote-text';
                    qTextP.textContent = qText;

                    quoteHtml = `
                        <div class="tt-quote-card">
                            <div class="tt-quote-header">
                                ${qAvatarHtml}
                                <span class="tt-quote-author">${qAuthorName}</span>
                                <span class="tt-quote-username">@${qScreenName}</span>
                            </div>
                            ${qTextP.outerHTML}
                            ${qMediaHtml}
                        </div>
                    `;
                }

                // Date String
                let dateStr = '';
                if (cached && cached.created_at) {
                    try {
                        const d = new Date(cached.created_at);
                        if (!isNaN(d.getTime())) {
                            dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
                        }
                    } catch (e) { }
                }

                // Escape text for safety
                const textP = document.createElement('p');
                textP.className = 'tt-text';
                textP.textContent = tweetText;

                card.innerHTML = `
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
                        ${textP.outerHTML}
                        ${mediaHtml}
                        ${quoteHtml}
                    </div>
                    <div class="tt-footer">
                        <span class="tt-date">${dateStr}</span>
                    </div>
                `;
                modalTweetsContainer.appendChild(card);
            });
        } else {
            modalTweetsContainer.style.display = 'none';
        }

        // Amazon Link (非強調スタイル)
        modalAmazonLink.href = book.amazon_url || '#';

        // Share X （指定文面フォーマット）
        modalShareX.onclick = () => {
            const pageUrl = book.isbn ? `https://protesthub.jp/books/${book.isbn}.html` : `https://protesthub.jp/books/index.html`;
            const shareText = `『${book.title}』\n#反戦読書部\n${pageUrl}`;
            const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
            window.open(xUrl, '_blank', 'noopener,noreferrer');
        };

        modalEl.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    // Modal Close
    function closeModal() {
        if (tweetObserver) {
            tweetObserver.disconnect();
            tweetObserver = null;
        }
        modalEl.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    // Toggle Read More
    readMoreBtn.addEventListener('click', () => {
        if (modalDescription.classList.contains('clamp-1')) {
            modalDescription.classList.remove('clamp-1');
            readMoreBtn.textContent = '▲ 折りたたむ';
        } else {
            modalDescription.classList.add('clamp-1');
            readMoreBtn.textContent = '▼ 続きを読む';
        }
    });

    // Event Listeners
    searchInput.addEventListener('input', updateList);
    sortSelect.addEventListener('change', () => {
        if (sortSelect.value === 'random') {
            getRandomOrderMap(true);
        }
        updateList();
    });
    closeBtn.addEventListener('click', closeModal);

    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) {
            closeModal();
        }
    });

    let lastWidth = window.innerWidth;
    let resizeTimer;
    window.addEventListener('resize', () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (currentFilteredBooks.length > 0) {
                renderWall(currentFilteredBooks);
            } else {
                updateList();
            }
        }, 200);
    });

    // お知らせエリア（news.html）の自動読込（file://直開き・Webサーバー両対応）
    function loadNews() {
        const newsArea = document.getElementById('news-area');
        if (!newsArea) return;

        const isFileProtocol = window.location.protocol === 'file:';

        const setIframeFallback = () => {
            newsArea.innerHTML = '<iframe src="news.html" class="news-iframe" scrolling="no" title="お知らせ" id="news-iframe-el"></iframe>';
            const iframe = document.getElementById('news-iframe-el');
            if (iframe) {
                iframe.onload = () => {
                    try {
                        const body = iframe.contentWindow.document.body;
                        if (body && body.scrollHeight) {
                            iframe.style.height = (body.scrollHeight + 4) + 'px';
                        }
                    } catch (e) {
                        // ignore cross-origin error if any
                    }
                };
            }
        };

        if (isFileProtocol) {
            setIframeFallback();
            return;
        }

        fetch('news.html')
            .then(res => {
                if (!res.ok) throw new Error('news.html not found');
                return res.text();
            })
            .then(html => {
                if (html && html.trim()) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const banner = doc.querySelector('.news-banner');
                    if (banner) {
                        newsArea.appendChild(banner);
                    } else {
                        newsArea.innerHTML = html;
                    }
                }
            })
            .catch(() => {
                setIframeFallback();
            });
    }

    // Initial Render & Load
    loadNews();
    updateList();
});

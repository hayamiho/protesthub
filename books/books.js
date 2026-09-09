/**
 * ProtestHub /books/ スクリプト
 */

// SNSシェア時のハッシュタグ設定
// --------------------------------------------------------------------------
// ※ 期間終了後（例: 9/23以降）は、以下の配列から不要なタグを削除・コメントアウトしてください。
const SHARE_HASHTAGS = [
    '#反戦読書部',
    '#オンライン反戦読書デモ2026秋'
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

    // Helper: Book object property resolver
    function resolveBook(book) {
        // Image path
        let img = book.image || book.file || '';
        if (img && !img.startsWith('http') && !img.startsWith('/') && !img.startsWith('./') && !img.startsWith('../')) {
            img = 'images/' + img;
        }

        // Tweets array (tw1 ~ tw10)
        let tweets = book.tweets;
        if (!tweets) {
            tweets = [];
            for (let i = 1; i <= 10; i++) {
                const tw = book[`tw${i}`] || book[`ツイート${i}`];
                if (tw && tw.trim()) {
                    tweets.push(tw.trim());
                }
            }
        }

        return {
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
        if (width <= 480) return 2;
        if (width <= 768) return 3;
        if (width <= 992) return 4;
        if (width <= 1200) return 5;
        return 6;
    }

    // 書籍カードエレメント生成
    function createBookCard(book) {
        const card = document.createElement('article');
        card.className = 'book-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${book.title} の詳細を表示`);

        card.innerHTML = `
            <img src="${book.image}" alt="${book.title}" loading="lazy" onerror="this.src='../images/logo.png';">
        `;

        card.addEventListener('click', () => openModal(book));
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
        } else if (sortVal === 'title') {
            filtered.sort((a, b) => {
                const bA = resolveBook(a);
                const bB = resolveBook(b);
                return bA.title.localeCompare(bB.title, 'ja');
            });
        } else if (sortVal === 'newest') {
            // スプレッドシートの登録順で末尾（最新）を先頭（左上）にするため逆順
            filtered.reverse();
        }

        renderWall(filtered);
    }

    // Extract Tweet ID from URL
    function getTweetId(urlStr) {
        if (!urlStr) return null;
        const match = urlStr.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    }

    // Modal Open
    function openModal(book) {
        // Reset scroll positions
        if (modalPanel) modalPanel.scrollTop = 0;
        if (modalRight) modalRight.scrollTop = 0;
        if (modalLeft) modalLeft.scrollTop = 0;

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

        // 関連ポスト（X公式埋め込み表示）
        modalTweetsContainer.innerHTML = '';
        if (book.tweets && book.tweets.length > 0) {
            modalTweetsContainer.style.display = 'flex';

            book.tweets.forEach(twUrl => {
                const tweetId = getTweetId(twUrl);
                const tweetItemWrapper = document.createElement('div');
                tweetItemWrapper.className = 'tweet-embed-item';

                if (tweetId && window.twttr && window.twttr.widgets) {
                    window.twttr.widgets.createTweet(tweetId, tweetItemWrapper, {
                        theme: 'light',
                        conversation: 'none',
                        dnt: true
                    });
                } else if (twUrl.startsWith('http')) {
                    tweetItemWrapper.innerHTML = `
            <blockquote class="twitter-tweet" data-dnt="true">
              <a href="${twUrl}"></a>
            </blockquote>
          `;
                }
                modalTweetsContainer.appendChild(tweetItemWrapper);
            });

            if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                window.twttr.widgets.load(modalTweetsContainer);
            }
        } else {
            modalTweetsContainer.style.display = 'none';
        }

        // Amazon Link (非強調スタイル)
        modalAmazonLink.href = book.amazon_url || '#';

        // Share X （指定文面フォーマット）
        modalShareX.onclick = () => {
            const tagsText = SHARE_HASHTAGS.join('\n');
            const shareText = `「${book.title}」\n${tagsText}\n\n📚️プロテスターの本棚📚️\nhttps://www.protesthub.jp/books/index.html`;
            const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
            window.open(xUrl, '_blank', 'noopener,noreferrer');
        };

        modalEl.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    // Modal Close
    function closeModal() {
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
    sortSelect.addEventListener('change', updateList);
    closeBtn.addEventListener('click', closeModal);

    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) {
            closeModal();
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            updateList();
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

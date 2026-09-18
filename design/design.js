/**
 * ProtestHub /design/ メインスクリプト
 * - サムネイル表示: images/*.webp（軽量）
 * - モーダル大画像 / ダウンロード / 印刷: images/*.png（高品質）
 * - 全機能保持: セット表示・ソート・モーダル・印刷・ネプリ・シェア・OGP動的書き換え
 */

document.addEventListener('DOMContentLoaded', () => {
    let posters = typeof POSTERS_DATA !== 'undefined' ? POSTERS_DATA : [];
    let filteredPosters = [...posters];
    let activePoster = null;
    let activeColor = null;

    // サムネイル用（.webp）とフル画像用（元ファイル名そのまま）のルートを分離
    const imageRoot = "images/";

    // ファイル名の拡張子を .webp に変換する関数（サムネイル用）
    function toWebp(filename) {
        return filename.replace(/\.[^/.]+$/, ".webp");
    }

    const wall = document.querySelector("#wall");
    const search = document.querySelector("#search");
    const category = document.querySelector("#category");
    const colorChips = document.querySelectorAll(".color-chip");
    const modal = document.querySelector("#modal");
    const modalImage = document.querySelector("#modal-image");
    const modalTitle = document.querySelector("#modal-title");
    const modalFile = document.querySelector("#modal-file");
    const modalTag = document.querySelector("#modal-tag");
    const modalDescription = document.querySelector("#modal-description");
    const creatorLink = document.querySelector("#creator-link");
    const modalDownload = document.querySelector("#modal-download");
    const closeButton = document.querySelector("#close");
    const rightsAgree = document.querySelector("#rights-agree");
    const shareXButton = document.querySelector("#share-x");
    const shareFacebookButton = document.querySelector("#share-facebook");
    const shareInstagramButton = document.querySelector("#share-instagram");
    const printButton = document.querySelector("#print");
    const shareStatus = document.querySelector("#share-status");
    const authorTitle = document.querySelector("#author-title");
    const sortSelect = document.querySelector("#sort");

    colorChips.forEach(chip => {
        chip.addEventListener("click", () => {
            const color = chip.getAttribute("data-color");
            if (activeColor === color) {
                activeColor = null;
                chip.classList.remove("active");
            } else {
                colorChips.forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                activeColor = color;
            }
            resetWall();
        });
    });

    function openPoster(poster) {
        // モーダル大画像はフルサイズ PNG を使用
        const src = imageRoot + poster.file;
        activePoster = poster;
        modalImage.src = src;
        modalImage.alt = poster.title;

        modalTitle.textContent = poster.title;
        modalFile.textContent = poster.file;
        modalTag.textContent = [poster.cat, ...(poster.tags || [])].join(" / ");
        modalDescription.innerHTML = poster.desc || "";

        creatorLink.textContent = poster.by ? `@${poster.by}` : "-";
        creatorLink.href = poster.url || "#";

        // バリエーション（同じIDシリーズ）- サムネイルはwebp
        const variantList = document.querySelector("#variant-list");
        const id = poster.id || (poster.file.match(/([a-z]{2}-\d{6})/i) ? poster.file.match(/([a-z]{2}-\d{6})/i)[1] : null);

        variantList.innerHTML = "";
        if (id) {
            const variants = posters.filter(p => {
                const pId = p.id || (p.file.match(/([a-z]{2}-\d{6})/i) ? p.file.match(/([a-z]{2}-\d{6})/i)[1] : null);
                return pId === id;
            });
            variants.forEach(v => {
                const img = document.createElement("img");
                img.src = imageRoot + toWebp(v.file); // サムネイルはwebp
                img.className = "variant-thumb";
                img.onclick = () => openPoster(v);
                variantList.appendChild(img);
            });
        }

        // 作者の他の作品 - サムネイルはwebp
        const authorList = document.querySelector("#author-list");
        authorList.innerHTML = "";
        authorTitle.textContent = poster.by ? `@${poster.by}の作品一覧` : "他の作品";

        if (poster.by) {
            const sameAuthor = posters.filter(p => p.by === poster.by);
            const uniqueDesigns = [];

            sameAuthor.forEach(p => {
                const designId = p.id || (p.file.match(/([a-z]{2}-\d{6})/i) ? p.file.match(/([a-z]{2}-\d{6})/i)[1] : p.file);
                if (!uniqueDesigns.some(item => {
                    const itemId = item.id || (item.file.match(/([a-z]{2}-\d{6})/i) ? item.file.match(/([a-z]{2}-\d{6})/i)[1] : item.file);
                    return itemId === designId;
                })) {
                    uniqueDesigns.push(p);
                }
            });

            const currentDesignId = id || poster.file;
            const filteredDesigns = uniqueDesigns.filter(p => {
                const pDesignId = p.id || (p.file.match(/([a-z]{2}-\d{6})/i) ? p.file.match(/([a-z]{2}-\d{6})/i)[1] : p.file);
                return pDesignId !== currentDesignId;
            });

            filteredDesigns.slice(0, 12).forEach(v => {
                const img = document.createElement("img");
                img.src = imageRoot + toWebp(v.file); // サムネイルはwebp
                img.className = "variant-thumb";
                img.onclick = () => openPoster(v);
                authorList.appendChild(img);
            });
        }

        rightsAgree.checked = false;
        updateRightsLockedState();
        shareStatus.textContent = "";
        modal.classList.add("is-open");
        closeButton.focus();

        // GA: Select Content
        if (typeof gtag === 'function') {
            gtag('event', 'select_content', {
                content_type: 'image',
                item_id: poster.file
            });
        }
    }

    function closePoster() {
        modal.classList.remove("is-open");
        modalImage.src = "";
        activePoster = null;
    }

    function updateRightsLockedState() {
        const isAllowed = rightsAgree.checked;
        modalDownload.disabled = !isAllowed;
        printButton.disabled = !isAllowed;
    }

    function posterMatches(poster) {
        const query = search.value.trim().toLowerCase();
        const categoryValue = category.value;
        const haystack = `${poster.title || ''} ${poster.cat || ''} ${(poster.tags || []).join(" ")} ${poster.file || ''} ${poster.by || ''}`.toLowerCase();

        let colorMatch = true;
        if (activeColor) {
            if (!poster.color) {
                colorMatch = false;
            } else {
                const colors = poster.color.split('|').map(c => c.trim());
                colorMatch = colors.includes(activeColor);
            }
        }

        return colorMatch && (!query || haystack.includes(query)) && (categoryValue === "all" || poster.cat === categoryValue);
    }

    // サムネイルはwebpを使用
    function createPin(poster) {
        const button = document.createElement("button");
        button.className = "pin";
        button.type = "button";
        button.setAttribute("aria-label", `${poster.title || ''}を開く`);
        button.innerHTML = `<img src="${imageRoot + toWebp(poster.file)}" alt="${poster.title || ''}" loading="lazy">`;
        button.addEventListener("click", () => openPoster(poster));
        return button;
    }

    function createSetPin(main, subs) {
        const button = createPin(main);
        if (subs.length > 0) {
            const subWrap = document.createElement("div");
            subWrap.className = "pin-subs";
            subs.forEach(sub => {
                const img = document.createElement("img");
                img.src = imageRoot + toWebp(sub.file); // サムネイルはwebp
                img.alt = sub.title || '';
                img.className = "pin-sub";
                img.loading = "lazy";
                img.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openPoster(sub);
                });
                subWrap.appendChild(img);
            });
            button.appendChild(subWrap);
        }
        return button;
    }

    // 列数の算出（books.cssのcolumn-count切り替えと同じブレークポイント）
    function getColumnCount() {
        const width = window.innerWidth;
        if (width <= 768) return 3;
        if (width <= 992) return 4;
        if (width <= 1200) return 5;
        return 6;
    }

    function renderWall() {
        const colsCount = getColumnCount();
        wall.innerHTML = "";

        const columns = [];
        for (let i = 0; i < colsCount; i++) {
            const col = document.createElement("div");
            col.className = "wall-column";
            wall.appendChild(col);
            columns.push(col);
        }

        const renderedSeries = new Set();
        const itemsToRender = [];
        const isSearching = !!(search && search.value.trim()) || !!activeColor;

        filteredPosters.forEach((poster) => {
            const hasSet = !isSearching && (poster.set === "1" || poster.set === 1);
            if (hasSet) {
                const seriesId = poster.file.match(/([a-z]{2}-\d{6})/i)?.[1];
                if (!seriesId || renderedSeries.has(seriesId)) return;
                renderedSeries.add(seriesId);

                const members = posters
                    .filter(p => (p.set === "1" || p.set === 1)
                        && p.file.match(/([a-z]{2}-\d{6})/i)?.[1] === seriesId)
                    .sort((a, b) => a.file.localeCompare(b.file));

                const main = members[0];
                const subs = members.slice(1);
                itemsToRender.push({ type: 'set', main, subs });
            } else {
                itemsToRender.push({ type: 'single', poster });
            }
        });

        itemsToRender.forEach((item, index) => {
            const targetCol = columns[index % colsCount];
            if (item.type === 'set') {
                targetCol.appendChild(createSetPin(item.main, item.subs));
            } else {
                targetCol.appendChild(createPin(item.poster));
            }
        });
    }

    function resetWall() {
        const sortValue = sortSelect.value;

        // フィルタリング
        filteredPosters = posters.filter(posterMatches);

        // ソート
        if (sortValue === "random") {
            for (let i = filteredPosters.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [filteredPosters[i], filteredPosters[j]] = [filteredPosters[j], filteredPosters[i]];
            }
        } else if (sortValue === "popular") {
            // 人気順（views の降順）
            filteredPosters.sort((a, b) => (b.views || 0) - (a.views || 0));
        } else {
            // 新着順（元の配列を逆順：数字が大きいIDが上）
            filteredPosters = [...posters.filter(posterMatches)].reverse();
        }

        wall.innerHTML = "";
        if (filteredPosters.length === 0) return;
        renderWall();
    }

    function setCategoryCounts() {
        const counts = posters.reduce((totals, poster) => {
            if (poster.cat) {
                totals[poster.cat] = (totals[poster.cat] || 0) + 1;
            }
            return totals;
        }, {});

        const cats = [...new Set(posters.map(p => p.cat))]
            .filter(c => c)
            .sort((a, b) => {
                const diff = (counts[b] || 0) - (counts[a] || 0);
                return diff !== 0 ? diff : a.localeCompare(b);
            });

        const currentVal = category.value;
        category.innerHTML = '<option value="all">すべて</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            category.appendChild(opt);
        });
        category.value = cats.includes(currentVal) ? currentVal : "all";

        [...category.options].forEach((option) => {
            const total = option.value === "all" ? posters.length : counts[option.value] || 0;
            const label = option.value === "all" ? "すべて" : option.value;
            option.textContent = `${label}(${total})`;
        });
    }

    // ダウンロード処理（フルサイズ PNG）
    async function downloadPoster() {
        if (!activePoster || modalDownload.disabled) return;
        const src = imageRoot + activePoster.file; // ダウンロードはPNG
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = activePoster.file;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch {
            const link = document.createElement("a");
            link.href = src;
            link.target = "_blank";
            link.rel = "noopener";
            document.body.append(link);
            link.click();
            link.remove();
        }

        if (typeof gtag === 'function') {
            gtag('event', 'file_download', {
                file_name: activePoster.file,
                file_extension: 'png'
            });
        }
    }

    function sharePoster(service) {
        if (!activePoster) return;

        const fileNameBase = activePoster.file.replace(/\.[^/.]+$/, "");
        const shareUrl = `https://www.protesthub.jp/design/${fileNameBase}.html`;
        const shareText = `${activePoster.title} / Protest Hub`;

        if (service === "x") {
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank", "noopener");
            shareStatus.textContent = "Xの投稿画面を開きました。";
            return;
        }

        if (service === "facebook") {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "noopener");
            shareStatus.textContent = "Facebookの共有画面を開きました。";
            return;
        }

        const imageUrl = `https://www.protesthub.jp/design/images/${activePoster.file}`;
        navigator.clipboard.writeText(imageUrl)
            .then(() => {
                shareStatus.textContent = "Instagram用に画像リンクをコピーしました。";
            })
            .catch(() => {
                shareStatus.textContent = "Instagramを開きました。画像リンクはコピーできませんでした。";
            });

        if (typeof gtag === 'function') {
            gtag('event', 'share', {
                method: service,
                content_type: 'image',
                item_id: activePoster.file
            });
        }
    }

    function init() {
        setCategoryCounts();
        resetWall();

        // URLパラメータによる動的OGP & 自動オープン
        (function () {
            const params = new URLSearchParams(window.location.search);
            const p = params.get('p');
            if (p) {
                const poster = posters.find(item => item.file === p);
                if (poster) {
                    // OGPメタタグ書き換え（クローラー向け）
                    const shareUrl = `https://www.protesthub.jp/design/index.html?p=${poster.file}`;
                    const shareTitle = `${poster.title} / Protest Hub Design`;
                    const shareDesc = poster.desc || "プロテストハブで公開中のデザインです。";
                    const shareImg = `https://www.protesthub.jp/design/images/${poster.file}`;

                    document.getElementById('og-title').setAttribute('content', shareTitle);
                    document.getElementById('tw-title').setAttribute('content', shareTitle);
                    document.getElementById('og-description').setAttribute('content', shareDesc);
                    document.getElementById('tw-description').setAttribute('content', shareDesc);
                    document.getElementById('og-image').setAttribute('content', shareImg);
                    document.getElementById('tw-image').setAttribute('content', shareImg);
                    document.getElementById('og-url').setAttribute('content', shareUrl);

                    openPoster(poster);
                }
            }
        })();
    }

    init();

    search.addEventListener("input", resetWall);
    category.addEventListener("change", resetWall);
    sortSelect.addEventListener("change", resetWall);

    let lastWidth = window.innerWidth;
    let resizeTimer;
    window.addEventListener("resize", () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            renderWall();
        }, 200);
    });
    closeButton.addEventListener("click", closePoster);
    rightsAgree.addEventListener("change", updateRightsLockedState);
    modalDownload.addEventListener("click", downloadPoster);
    shareXButton.addEventListener("click", () => sharePoster("x"));
    shareFacebookButton.addEventListener("click", () => sharePoster("facebook"));
    shareInstagramButton.addEventListener("click", () => sharePoster("instagram"));

    creatorLink.addEventListener("click", () => {
        if (!activePoster) return;
        if (typeof gtag === 'function') {
            gtag('event', 'click_creator_link', {
                item_id: activePoster.file,
                creator: activePoster.by,
                url: creatorLink.href
            });
        }
    });

    printButton.addEventListener("click", () => {
        if (!modalImage.complete) return;

        const isLandscape = modalImage.naturalWidth > modalImage.naturalHeight;
        document.body.classList.add("is-printing");
        closeButton.style.setProperty("display", "none", "important");

        let styleElement = null;
        if (isLandscape) {
            styleElement = document.createElement("style");
            styleElement.textContent = "@media print { @page { size: landscape !important; } }";
            document.head.appendChild(styleElement);
        }

        window.print();

        if (typeof gtag === 'function') {
            gtag('event', 'print_content', {
                item_id: activePoster.file
            });
        }

        setTimeout(() => {
            document.body.classList.remove("is-printing");
            closeButton.style.removeProperty("display");
            if (styleElement) {
                styleElement.remove();
            }
        }, 400);
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closePoster();
    });
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal.classList.contains("is-open")) closePoster();
    });
});

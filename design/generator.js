const fs = require('fs');
const path = require('path');

// 設定
const DATA_FILE = path.join(__dirname, 'data.json');
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const OUTPUT_DIR = __dirname; // design/ 直下

function generate() {
    console.log('--- HTML Generation Started ---');

    // データの読み込み
    if (!fs.existsSync(DATA_FILE)) {
        console.error('Error: data.json not found');
        return;
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // テンプレートの読み込み
    if (!fs.existsSync(TEMPLATE_FILE)) {
        console.error('Error: template.html not found');
        return;
    }
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

    // 補助関数: HTMLタグを除去
    const stripTags = (str) => str.replace(/<[^>]*>?/gm, '');
    // 補助関数: クォートをエスケープ (JS文字列用)
    const escapeJs = (str) => str.replace(/'/g, "\\'").replace(/"/g, '\\"');

    let count = 0;
    data.forEach(item => {
        const fileNameBase = item.file.replace(/\.[^/.]+$/, ""); // 拡張子を除去
        const outputFileName = `${fileNameBase}.html`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);

        const title = item.title || '';
        const desc = item.desc || '';
        const by = item.by || '';

        // 置換処理 (特殊文字 $ に影響されないよう split/join を使用)
        let content = template;
        const replacements = {
            '{{TITLE}}': title,
            '{{DESC}}': desc,
            '{{FILE_IMAGE}}': item.file || '',
            '{{FILE_HTML}}': outputFileName,
            '{{BY}}': by,
            '{{URL}}': item.url || '',
            '{{CAT_TAGS}}': [item.cat, ...(item.tags || [])].filter(t => t).join(" / "),
            '{{OG_TITLE}}': stripTags(item.og_title || title),
            '{{OG_DESC}}': stripTags(item.og_desc || desc),
            '{{JS_TITLE}}': escapeJs(title),
            '{{JS_BY}}': escapeJs(by)
        };

        Object.keys(replacements).forEach(placeholder => {
            content = content.split(placeholder).join(replacements[placeholder]);
        });

        // 書き出し
        fs.writeFileSync(outputPath, content, 'utf8');
        console.log(`[${count + 1}/${data.length}] Generated: ${outputFileName}`);
        count++;
    });

    console.log(`\n--- Finished! Total ${count} files generated successfully. ---`);
}

generate();

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

    let count = 0;
    data.forEach(item => {
        const fileNameBase = item.file.replace(/\.[^/.]+$/, ""); // 拡張子を除去
        const outputFileName = `${fileNameBase}.html`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);

        // 置換処理
        let content = template;
        content = content.replace(/{{TITLE}}/g, item.title);
        content = content.replace(/{{DESC}}/g, item.desc);
        content = content.replace(/{{FILE_IMAGE}}/g, item.file);
        content = content.replace(/{{FILE_HTML}}/g, outputFileName);
        content = content.replace(/{{BY}}/g, item.by);
        content = content.replace(/{{URL}}/g, item.url);

        const catTags = [item.cat, ...item.tags].join(" / ");
        content = content.replace(/{{CAT_TAGS}}/g, catTags);

        // 書き出し
        fs.writeFileSync(outputPath, content, 'utf8');
        console.log(`Generated: ${outputFileName}`);
        count++;
    });

    console.log(`--- Finished! Total ${count} files generated. ---`);
}

generate();

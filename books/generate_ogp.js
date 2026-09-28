const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BOOKS_DIR = __dirname;
const IMAGES_DIR = path.join(BOOKS_DIR, 'images');
const BG_COLOR = '#f4efe6';
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const COVER_MAX_HEIGHT = 550;
const COVER_MAX_WIDTH = 1000;

async function generateOgpImages() {
    console.log('--- Books OGP Image Generation Started ---');

    if (!fs.existsSync(IMAGES_DIR)) {
        console.error('Error: images directory not found');
        return;
    }

    const files = fs.readdirSync(IMAGES_DIR).filter(f => f.match(/^\d{13}\.(webp|png|jpg|jpeg)$/));
    let count = 0;

    for (const file of files) {
        const isbn = file.replace(/\.[^/.]+$/, "");
        const inputPath = path.join(IMAGES_DIR, file);
        const outputPath = path.join(IMAGES_DIR, `ogp_${isbn}.jpg`);

        try {
            // リサイズした書影画像を作成
            const resizedCoverBuffer = await sharp(inputPath)
                .resize({
                    height: COVER_MAX_HEIGHT,
                    width: COVER_MAX_WIDTH,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();

            // 書影のメタデータ取得
            const coverMeta = await sharp(resizedCoverBuffer).metadata();
            const shadowWidth = coverMeta.width + 10;
            const shadowHeight = coverMeta.height + 10;

            // やわらかいドロップシャドウの作成
            const shadowBuffer = await sharp({
                create: {
                    width: shadowWidth,
                    height: shadowHeight,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0.12 }
                }
            }).png().toBuffer();

            // 1200x630 のベージュキャンバスを作成し合成
            const background = sharp({
                create: {
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    channels: 3,
                    background: BG_COLOR
                }
            });

            await background
                .composite([
                    {
                        input: shadowBuffer,
                        top: Math.round((CANVAS_HEIGHT - shadowHeight) / 2) + 3,
                        left: Math.round((CANVAS_WIDTH - shadowWidth) / 2) + 3
                    },
                    {
                        input: resizedCoverBuffer,
                        top: Math.round((CANVAS_HEIGHT - coverMeta.height) / 2),
                        left: Math.round((CANVAS_WIDTH - coverMeta.width) / 2)
                    }
                ])
                .jpeg({ quality: 90 })
                .toFile(outputPath);

            count++;
            console.log(`[${count}/${files.length}] Generated OGP: ogp_${isbn}.jpg`);
        } catch (err) {
            console.error(`Error generating OGP for ${file}:`, err);
        }
    }

    console.log(`\n--- Finished! Generated ${count} OGP images in books/images/ ---`);
}

generateOgpImages();

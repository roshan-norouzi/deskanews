const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('@playwright/test', { paths: [path.join(__dirname, '../../apps/web')] }));

const inputPath = path.join(__dirname, '../assets/deska-logo-lockup.png');
const outputDir = path.join(__dirname, '../assets');

(async () => {
  const input = `data:image/png;base64,${fs.readFileSync(inputPath).toString('base64')}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const crops = await page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    console.log('source image dimensions', image.naturalWidth, image.naturalHeight);
    const removeWhite = (context, width, height) => {
      const pixels = context.getImageData(0, 0, width, height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const brightness = Math.max(red, green, blue);
        if (red > 245 && green > 245 && blue > 245) pixels.data[index + 3] = 0;
        else if (brightness > 232) pixels.data[index + 3] = Math.round((255 - brightness) * 11);
      }
      context.putImageData(pixels, 0, 0);
    };
    const crop = (x, y, width, height, canvasWidth, canvasHeight, drawX, drawY, drawWidth, drawHeight) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, x, y, width, height, drawX, drawY, drawWidth, drawHeight);
      removeWhite(context, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    const composeHeader = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      context.drawImage(image, 45, 48, 310, 290, 0, 0, 70, 70);
      context.drawImage(image, 45, 350, 310, 125, 84, 8, 148, 60);
      removeWhite(context, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return {
      dimensions: [image.naturalWidth, image.naturalHeight],
      symbol: crop(45, 48, 310, 290, 512, 512, 0, 0, 512, 512),
      wordmark: crop(45, 350, 310, 125, 900, 365, 0, 0, 900, 365),
      header: composeHeader(),
    };
  }, input);
  console.log('source image dimensions', crops.dimensions);
  delete crops.dimensions;
  for (const [name, data] of Object.entries(crops)) {
    fs.writeFileSync(path.join(outputDir, `deska-${name}.png`), Buffer.from(data, 'base64'));
  }
  await browser.close();
  console.log('Created deska-symbol.png and deska-header.png');
})().catch(error => { console.error(error); process.exit(1); });

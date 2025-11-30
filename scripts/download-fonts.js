/**
 * Скрипт для скачивания шрифтов DejaVu Sans
 * Запуск: node scripts/download-fonts.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '..', 'fonts');

// Создаем папку fonts если её нет
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// URL для скачивания шрифтов DejaVu Sans
// Используем прямые ссылки на релизы GitHub
const fontUrls = {
  normal: 'https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/ttf-DejaVuSans-2.37.zip',
  // Попробуем использовать другой подход - скачиваем из SourceForge
};

// Альтернативные источники - SourceForge
const altUrls = {
  normal: 'https://sourceforge.net/projects/dejavu/files/dejavu/2.37/dejavu-fonts-ttf-2.37.tar.bz2/download',
};

// Попробуем использовать прямые ссылки на отдельные файлы из SourceForge
const sourceforgeUrls = {
  normal: 'https://sourceforge.net/projects/dejavu/files/dejavu/2.37/dejavu-sans-ttf-2.37.tar.bz2/download',
};

// Или используем готовые ссылки на TTF файлы
const directUrls = {
  normal: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans.ttf',
  bold: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Bold.ttf',
  italics: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Oblique.ttf',
  bolditalics: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-BoldOblique.ttf',
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${path.basename(filepath)} from ${url}...`);
    
    const file = fs.createWriteStream(filepath);
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
        } catch (e) {
          // Ignore unlink errors
        }
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(filepath);
        console.log(`✓ Downloaded ${path.basename(filepath)} (${stats.size} bytes)`);
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      try {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      } catch (e) {
        // Ignore unlink errors
      }
      reject(err);
    });
  });
}

async function downloadFonts() {
  console.log('Starting font download...\n');
  
  const urlsToTry = [directUrls];
  
  for (const urls of urlsToTry) {
    try {
      await Promise.all([
        downloadFile(urls.normal, path.join(fontsDir, 'DejaVuSans.ttf')),
        downloadFile(urls.bold, path.join(fontsDir, 'DejaVuSans-Bold.ttf')),
        downloadFile(urls.italics, path.join(fontsDir, 'DejaVuSans-Oblique.ttf')),
        downloadFile(urls.bolditalics, path.join(fontsDir, 'DejaVuSans-BoldOblique.ttf')),
      ]);
      
      console.log('\n✓ All fonts downloaded successfully!');
      return;
    } catch (error) {
      console.warn(`\nFailed to download from source: ${error.message}`);
      console.log('Trying alternative source...\n');
    }
  }
  
  console.error('\n✗ Failed to download fonts from all sources');
  process.exit(1);
}

downloadFonts().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});


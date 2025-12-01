/**
 * Сервис для генерации PDF отчетов
 * Использует PDFMake с поддержкой кириллицы через pdfmake-unicode
 */

import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { DailyReport, Site } from '../types';
import { CalculationService } from './CalculationService';
import { getSiteById } from '../db';
import * as fs from 'fs';
import * as path from 'path';

export class PDFService {
  // Кэш для шрифтов
  private static fontCache: any = null;

  /**
   * Загружает шрифты DejaVu Sans с поддержкой кириллицы
   * Сначала пытается загрузить из локальных файлов, затем из CDN
   */
  private static async loadFonts(): Promise<any> {
    if (this.fontCache) {
      return this.fontCache;
    }

    try {
      // Пытаемся загрузить из локальных файлов
      // Пробуем разные пути для совместимости с разными окружениями
      const possiblePaths = [
        path.join(process.cwd(), 'fonts'), // Локальная разработка и некоторые серверы
        path.join(process.cwd(), '..', 'fonts'), // Vercel (код в dist/, шрифты в корне)
        path.join(__dirname, '..', '..', 'fonts'), // Относительно скомпилированного файла
        path.join(__dirname, '..', 'fonts'), // Альтернативный путь
      ];

      let fontsPath: string | null = null;
      for (const testPath of possiblePaths) {
        const testFile = path.join(testPath, 'DejaVuSans.ttf');
        if (fs.existsSync(testFile)) {
          fontsPath = testPath;
          console.log(`Found fonts directory at: ${fontsPath}`);
          break;
        }
      }

      if (fontsPath) {
        const localFonts = {
          normal: path.join(fontsPath, 'DejaVuSans.ttf'),
          bold: path.join(fontsPath, 'DejaVuSans-Bold.ttf'),
          italics: path.join(fontsPath, 'DejaVuSans-Oblique.ttf'),
          bolditalics: path.join(fontsPath, 'DejaVuSans-BoldOblique.ttf'),
        };

        // Проверяем, есть ли все необходимые файлы
        const allExist = 
          fs.existsSync(localFonts.normal) &&
          fs.existsSync(localFonts.bold) &&
          fs.existsSync(localFonts.italics) &&
          fs.existsSync(localFonts.bolditalics);

        if (allExist) {
          console.log('Loading fonts from local files...');
          this.fontCache = {
            DejaVuSans: {
              normal: fs.readFileSync(localFonts.normal),
              bold: fs.readFileSync(localFonts.bold),
              italics: fs.readFileSync(localFonts.italics),
              bolditalics: fs.readFileSync(localFonts.bolditalics),
            },
          };
          console.log('DejaVu Sans fonts loaded successfully from local files');
          return this.fontCache;
        } else {
          console.log('Some font files are missing, checking which ones...');
          console.log(`Normal exists: ${fs.existsSync(localFonts.normal)}`);
          console.log(`Bold exists: ${fs.existsSync(localFonts.bold)}`);
          console.log(`Italics exists: ${fs.existsSync(localFonts.italics)}`);
          console.log(`BoldItalics exists: ${fs.existsSync(localFonts.bolditalics)}`);
        }
      } else {
        console.log('Local fonts directory not found. Tried paths:');
        possiblePaths.forEach(p => console.log(`  - ${p} (exists: ${fs.existsSync(p)})`));
        console.log('Current working directory:', process.cwd());
        console.log('__dirname:', __dirname);
      }
      
      console.log('Local fonts not found, trying to load from CDN...');

      // Загружаем шрифты DejaVu Sans с поддержкой кириллицы
      // Пробуем разные CDN источники
      const fontUrls = [
        // jsdelivr CDN (самый надежный)
        {
          name: 'jsdelivr',
          normal: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@2.37/ttf/DejaVuSans.ttf',
          bold: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@2.37/ttf/DejaVuSans-Bold.ttf',
          italics: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@2.37/ttf/DejaVuSans-Oblique.ttf',
          bolditalics: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@2.37/ttf/DejaVuSans-BoldOblique.ttf',
        },
        // jsdelivr с другой версией
        {
          name: 'jsdelivr-v2',
          normal: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@master/ttf/DejaVuSans.ttf',
          bold: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@master/ttf/DejaVuSans-Bold.ttf',
          italics: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@master/ttf/DejaVuSans-Oblique.ttf',
          bolditalics: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@master/ttf/DejaVuSans-BoldOblique.ttf',
        },
        // Альтернативный источник - используем Roboto с кириллицей из Google Fonts
        // Используем правильные URL для Roboto
        {
          name: 'google-fonts-roboto',
          normal: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf',
          bold: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.ttf',
          italics: 'https://fonts.gstatic.com/s/roboto/v30/KFOkCnqEu92Fr1Mu51xIIzI.ttf',
          bolditalics: 'https://fonts.gstatic.com/s/roboto/v30/KFOjCnqEu92Fr1Mu51TzBjc6IeQ.ttf',
        },
        // Альтернативные URL для Roboto (если первые не работают)
        {
          name: 'google-fonts-roboto-alt',
          normal: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxPKTM1K9nS.ttf',
          bold: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4PKTM1K9nS.ttf',
          italics: 'https://fonts.gstatic.com/s/roboto/v30/KFOkCnqEu92Fr1Mu51xIIzIFKw.ttf',
          bolditalics: 'https://fonts.gstatic.com/s/roboto/v30/KFOjCnqEu92Fr1Mu51TzBjc6IeQ.ttf',
        },
        // GitHub raw (последний вариант)
        {
          name: 'github-raw',
          normal: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans.ttf',
          bold: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Bold.ttf',
          italics: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Oblique.ttf',
          bolditalics: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-BoldOblique.ttf',
        },
      ];

      // Пробуем загрузить шрифты из разных источников
      let fontsLoaded = false;
      let loadedFontName = '';
      for (const urls of fontUrls) {
        try {
          console.log(`Attempting to load fonts from source: ${urls.name || 'unknown'}, URL: ${urls.normal}`);
          const [normal, bold, italics, bolditalics] = await Promise.all([
            fetch(urls.normal, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
              },
            }).then((r) => {
              console.log(`Normal font response from ${urls.name}: ${r.status} ${r.statusText}, Content-Type: ${r.headers.get('content-type')}`);
              if (r.ok) {
                return r.arrayBuffer().then((buf) => {
                  console.log(`Normal font loaded, size: ${buf.byteLength} bytes`);
                  return buf;
                });
              }
              return null;
            }).catch((e) => {
              console.warn(`Failed to fetch normal font from ${urls.name}:`, e.message);
              return null;
            }),
            fetch(urls.bold, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
              },
            }).then((r) => {
              console.log(`Bold font response from ${urls.name}: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch bold font from ${urls.name}:`, e.message);
              return null;
            }),
            fetch(urls.italics, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
              },
            }).then((r) => {
              console.log(`Italics font response from ${urls.name}: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch italics font from ${urls.name}:`, e.message);
              return null;
            }),
            fetch(urls.bolditalics, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
              },
            }).then((r) => {
              console.log(`BoldItalics font response from ${urls.name}: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch bolditalics font from ${urls.name}:`, e.message);
              return null;
            }),
          ]);

          console.log(`Fonts loaded: normal=${!!normal}, bold=${!!bold}, italics=${!!italics}, bolditalics=${!!bolditalics}`);

          // Если загрузился хотя бы normal, используем его для всех вариантов (fallback)
          if (normal) {
            const fontName = urls.name === 'google-fonts-roboto' ? 'Roboto' : 'DejaVuSans';
            const normalBuffer = Buffer.from(normal);
            
            // Используем загруженные шрифты или fallback на normal
            this.fontCache = {
              [fontName]: {
                normal: normalBuffer,
                bold: bold ? Buffer.from(bold) : normalBuffer, // Fallback на normal
                italics: italics ? Buffer.from(italics) : normalBuffer, // Fallback на normal
                bolditalics: bolditalics ? Buffer.from(bolditalics) : normalBuffer, // Fallback на normal
              },
            };
            fontsLoaded = true;
            loadedFontName = fontName;
            
            if (bold && italics && bolditalics) {
              console.log(`${fontName} fonts loaded successfully (all variants) from source: ${urls.name}`);
            } else {
              console.warn(`${fontName} fonts loaded with fallback (using normal for missing variants) from source: ${urls.name}`);
            }
            break;
          } else {
            console.warn(`Not all fonts loaded successfully from ${urls.name}, trying next source...`);
          }
        } catch (error) {
          console.warn('Failed to load fonts from source:', error);
          continue;
        }
      }

      if (!fontsLoaded) {
        console.warn('Could not load DejaVu Sans fonts, using Helvetica (standard PDF font, may not support Cyrillic)');
        // Используем Helvetica - стандартный PDF шрифт, который всегда доступен
        // Но он не поддерживает кириллицу, поэтому лучше загрузить DejaVu Sans
        this.fontCache = {
          Helvetica: {
            normal: 'Helvetica',
            bold: 'Helvetica-Bold',
            italics: 'Helvetica-Oblique',
            bolditalics: 'Helvetica-BoldOblique',
          },
        };
      }

      return this.fontCache;
    } catch (error) {
      console.error('Error loading fonts:', error);
      this.fontCache = {};
      return this.fontCache;
    }
  }

  /**
   * Создает принтер PDF с поддержкой кириллицы
   */
  private static async createPrinter(): Promise<PdfPrinter> {
    try {
      const fonts = await this.loadFonts();
      console.log('Creating PDF printer with fonts:', Object.keys(fonts));
      const printer = new PdfPrinter(fonts);
      return printer;
    } catch (error) {
      console.error('Error creating PDF printer:', error);
      throw error;
    }
  }

  /**
   * Возвращает объект с bold стилем, если шрифты загружены
   */
  private static getBoldStyle(): { bold?: boolean } {
    return (PDFService.fontCache && (PDFService.fontCache.DejaVuSans || PDFService.fontCache.Roboto || PDFService.fontCache.Helvetica)) 
      ? { bold: true } 
      : {};
  }

  /**
   * Генерирует PDF отчет по площадке и дню
   */
  static async generateReportPDF(report: DailyReport, site?: Site): Promise<Buffer> {
    console.log(`Starting PDF generation for report ${report.id}`);
    let printer: PdfPrinter;
    
    try {
      printer = await this.createPrinter();
      console.log('PDF printer created successfully');
    } catch (error) {
      console.error('Failed to create PDF printer:', error);
      throw new Error(`Failed to create PDF printer: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Форматируем дату
    const formattedDate = this.formatDate(report.date);
    const createdAtDate = this.formatDate(new Date().toISOString());

    // Создаем структуру документа
    const content: any[] = [
      // Заголовок
      {
        text: 'Отчет по площадке',
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },
    ];

    // Информация о площадке
    if (site) {
      content.push(
        {
          text: [
            { text: 'Площадка: ', ...this.getBoldStyle() },
            site.name,
          ],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          text: [
            { text: 'Дата: ', ...this.getBoldStyle() },
            formattedDate,
          ],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          text: [
            { text: 'Ответственный: ', ...this.getBoldStyle() },
            site.phone,
          ],
          margin: [0, 0, 0, 15] as [number, number, number, number],
        }
      );
    } else {
      content.push(        {
          text: [
            { text: 'Дата: ', ...this.getBoldStyle() },
            formattedDate,
          ],
          margin: [0, 0, 0, 15] as [number, number, number, number],
        });
    }

    // Разделитель
    content.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 1,
        },
      ],
      margin: [0, 0, 0, 15] as [number, number, number, number],
    });

    // Данные сотрудника
    content.push(
      {
        text: 'Данные сотрудника:',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Фамилия: ', ...this.getBoldStyle() },
          report.lastname,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Имя: ', ...this.getBoldStyle() },
          report.firstname,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: '№ QR: ', ...this.getBoldStyle() },
          report.qr_number,
        ],
        margin: [0, 0, 0, 15] as [number, number, number, number],
      }
    );

    // Финансовые данные
    content.push(
      {
        text: 'Финансовые показатели:',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Сумма по QR: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.qr_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Сумма наличных: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.cash_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      }
    );

    if (report.terminal_amount) {
      content.push(        {
          text: [
            { text: 'Сумма по терминалу: ', ...this.getBoldStyle() },
            CalculationService.formatAmount(report.terminal_amount),
          ],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        });
    }

    // Рассчитанные показатели
    content.push(
      {
        text: 'Расчеты:',
        style: 'sectionHeader',
        margin: [0, 15, 0, 10] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая выручка: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.total_revenue),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Зарплата (20%): ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.salary),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      }
    );

    if (report.bonus_penalty) {
      content.push(        {
          text: [
            { text: 'Бонус/штраф: ', ...this.getBoldStyle() },
            CalculationService.formatAmount(report.bonus_penalty),
          ],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        });
    }

    content.push(
      {
        text: [
          { text: 'Зарплата ответственного: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.responsible_salary),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общий оборот за день: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.total_daily),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма наличных: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.total_cash),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма по QR: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.total_qr),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Нал в конверте: ', ...this.getBoldStyle() },
          CalculationService.formatAmount(report.cash_in_envelope),
        ],
        margin: [0, 0, 0, 15] as [number, number, number, number],
      }
    );

    // Комментарий
    if (report.comment) {
      content.push(
        {
          text: 'Комментарий:',
          style: 'sectionHeader',
          margin: [0, 0, 0, 10] as [number, number, number, number],
        },
        {
          text: report.comment,
          margin: [0, 0, 0, 15] as [number, number, number, number],
        }
      );
    }

    // Подписи
    content.push({
      text: 'Подписи:',
      style: 'sectionHeader',
      margin: [0, 20, 0, 10] as [number, number, number, number],
    });

    const signatureValue =
      typeof report.signature === 'string' && report.signature.trim().length > 0
        ? report.signature
        : '__________________________';

    const responsibleSignatureValue =
      typeof report.responsible_signature === 'string' && report.responsible_signature.trim().length > 0
        ? report.responsible_signature
        : '__________________________';

    content.push(
      {
        text: [
          { text: 'Подпись: ', ...this.getBoldStyle() },
          signatureValue,
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Подпись ответственного: ', ...this.getBoldStyle() },
          responsibleSignatureValue,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      }
    );

    const docDefinition: TDocumentDefinitions = {
      content,
      styles: {
        header: {
          fontSize: 20,
          ...(PDFService.fontCache && (PDFService.fontCache.DejaVuSans || PDFService.fontCache.Roboto || PDFService.fontCache.Helvetica) ? { bold: true } : {}),
        },
        sectionHeader: {
          fontSize: 16,
          ...(PDFService.fontCache && (PDFService.fontCache.DejaVuSans || PDFService.fontCache.Roboto || PDFService.fontCache.Helvetica) ? { bold: true } : {}),
          decoration: 'underline',
        },
      },
      defaultStyle: {
        font: PDFService.fontCache && PDFService.fontCache.DejaVuSans 
          ? 'DejaVuSans' 
          : (PDFService.fontCache && PDFService.fontCache.Roboto
            ? 'Roboto'
            : (PDFService.fontCache && PDFService.fontCache.Helvetica ? 'Helvetica' : undefined)),
        fontSize: 12,
      },
      pageSize: 'A4',
      pageMargins: [50, 50, 50, 50] as [number, number, number, number],
      footer: function (currentPage: number, pageCount: number) {
        return {
          text: `Отчет создан: ${createdAtDate} | Страница ${currentPage} из ${pageCount}`,
          fontSize: 10,
          alignment: 'left',
          margin: [50, 10, 50, 0] as [number, number, number, number],
        };
      },
    };

    // Генерируем PDF
    console.log('Creating PDF document...');
    return new Promise((resolve, reject) => {
      try {
        console.log('Calling createPdfKitDocument...');
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        console.log('PDF document created, setting up event handlers...');
        const chunks: Buffer[] = [];

        pdfDoc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        pdfDoc.on('end', () => {
          console.log(`PDF generation completed, total chunks: ${chunks.length}`);
          const pdfBuffer = Buffer.concat(chunks);
          console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
          resolve(pdfBuffer);
        });

        pdfDoc.on('error', (error: Error) => {
          console.error('PDF generation error (from pdfDoc):', error);
          console.error('Error stack:', error.stack);
          reject(error);
        });

        console.log('Starting PDF document generation...');
        pdfDoc.end();
      } catch (error) {
        console.error('PDF creation error (catch block):', error);
        const errorDetails = error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : { error: String(error) };
        console.error('PDF creation error details:', JSON.stringify(errorDetails, null, 2));
        reject(error);
      }
    });
  }

  /**
   * Форматирует дату для отображения
   */
  private static formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

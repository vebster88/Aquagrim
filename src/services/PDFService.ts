/**
 * Сервис для генерации PDF отчетов
 * Использует PDFMake с поддержкой кириллицы через pdfmake-unicode
 */

import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { DailyReport, Site } from '../types';
import { CalculationService } from './CalculationService';
import { getSiteById, updateReport, getReportsBySite } from '../db';
import { formatBonusTargets } from '../utils/bonusTarget';
import * as fs from 'fs';
import * as path from 'path';

export class PDFService {
  // Кэш для шрифтов
  private static fontCache: any = null;

  /**
   * Форматирует сумму в рублях как целое число (без знаков после запятой)
   */
  private static formatAmountInteger(rubles: number): string {
    return `${Math.round(rubles)} ₽`;
  }

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
          fontSize: 18,
          ...(PDFService.fontCache && (PDFService.fontCache.DejaVuSans || PDFService.fontCache.Roboto || PDFService.fontCache.Helvetica) ? { bold: true } : {}),
        },
        sectionHeader: {
          fontSize: 14,
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
        fontSize: 11,
      },
      pageSize: 'A4',
      pageOrientation: 'landscape',
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
   * Начисляет бонус за лучшую выручку (500 рублей) сотруднику с максимальной выручкой
   * Бонус начисляется только если на площадке больше одного сотрудника
   * @returns true если бонус был начислен, false если нет
   */
  private static async applyBestRevenueBonus(reports: DailyReport[]): Promise<boolean> {
    // Бонус начисляется только если больше одного сотрудника
    if (reports.length <= 1) {
      return false;
    }

    // Находим сотрудника с максимальной выручкой
    let maxRevenue = -1;
    let bestEmployee: DailyReport | null = null;

    for (const report of reports) {
      if (report.total_revenue > maxRevenue) {
        maxRevenue = report.total_revenue;
        bestEmployee = report;
      }
    }

    if (!bestEmployee) {
      return false;
    }

    // Проверяем, не был ли уже начислен бонус за лучшую выручку
    // Проверяем по наличию "+ЛВ" в комментарии
    const hasBestRevenueBonus = bestEmployee.comment && bestEmployee.comment.includes('+ЛВ');
    
    if (!hasBestRevenueBonus) {
      // Добавляем 500 рублей к bonus_penalty
      const currentBonus = bestEmployee.bonus_penalty || 0;
      const newBonusPenalty = currentBonus + 500;

      // Добавляем "+ЛВ" к комментарию
      const newComment = bestEmployee.comment 
        ? `${bestEmployee.comment} +ЛВ`
        : '+ЛВ';

      // Пересчитываем значения с учетом нового бонуса
      const calculations = CalculationService.calculate({
        qr_amount: bestEmployee.qr_amount,
        cash_amount: bestEmployee.cash_amount,
        terminal_amount: bestEmployee.terminal_amount || 0,
        bonus_penalty: newBonusPenalty,
      });

      const updatedReport = {
        ...bestEmployee,
        bonus_penalty: newBonusPenalty,
        comment: newComment,
        ...calculations,
      };

      await updateReport(updatedReport);
      
      // Обновляем объект в массиве reports, чтобы использовать актуальные данные
      const index = reports.findIndex(r => r.id === bestEmployee!.id);
      if (index !== -1) {
        reports[index] = updatedReport;
      }
      
      console.log(`[PDFService] Applied best revenue bonus (500 ₽) to ${bestEmployee.lastname} ${bestEmployee.firstname} (revenue: ${updatedReport.total_revenue} ₽, bonus_penalty: ${updatedReport.bonus_penalty} ₽)`);
      return true;
    }
    
    return false;
  }

  /**
   * Генерирует сводный PDF по площадке:
   * 1) Таблица с сотрудниками и их результатами
   * 2) Сводные итоги по объекту
   * 3) Раздел с подписями
   */
  static async generateSiteSummaryPDF(site: Site, reports: DailyReport[]): Promise<Buffer> {
    console.log(`Starting site summary PDF generation for site ${site.id} (${site.name}), reports count: ${reports.length}`);

    // Начисляем бонус за лучшую выручку перед генерацией PDF
    const bonusApplied = await this.applyBestRevenueBonus(reports);
    
    // Если бонус был начислен, перечитываем отчеты из БД для гарантии актуальности данных
    if (bonusApplied) {
      const updatedReports = await getReportsBySite(site.id, site.date);
      // Заменяем старые отчеты на обновленные
      reports.length = 0;
      reports.push(...updatedReports);
      console.log(`[PDFService] Reloaded reports from DB after applying best revenue bonus`);
    }

    let printer: PdfPrinter;
    try {
      printer = await this.createPrinter();
      console.log('PDF printer for site summary created successfully');
    } catch (error) {
      console.error('Failed to create PDF printer for site summary:', error);
      throw new Error(`Failed to create PDF printer: ${error instanceof Error ? error.message : String(error)}`);
    }

    const formattedDate = this.formatDate(site.date);
    const createdAtDate = this.formatDate(new Date().toISOString());

    // Сводные показатели по площадке
    const totals = reports.reduce(
      (acc, r) => {
        acc.qr_amount += r.qr_amount;
        acc.cash_amount += r.cash_amount;
        acc.terminal_amount += r.terminal_amount || 0;
        acc.total_revenue += r.total_revenue;
        acc.salary += r.salary;
        // Суммируем бонусы/штрафы (из столбца PDF: bonus_by_targets + bonus_penalty, без responsibleBonus)
        const bonusByTargets = r.bonus_by_targets || 0;
        const manualBonusPenalty = r.bonus_penalty || 0;
        acc.total_bonuses_penalties += bonusByTargets + manualBonusPenalty;
        return acc;
      },
      {
        qr_amount: 0,
        cash_amount: 0,
        terminal_amount: 0,
        total_revenue: 0,
        salary: 0,
        total_bonuses_penalties: 0,
      }
    );

    // Находим ответственного (на объекте может быть только 1)
    const responsible = reports.find(r => r.is_responsible);
    const responsibleSalary = responsible && responsible.responsible_salary_bonus 
      ? responsible.responsible_salary_bonus 
      : 0;

    const content: any[] = [
      {
        text: 'Сводный отчет по площадке',
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },
      {
        columns: [
          {
            text: [
              { text: 'Площадка: ', ...this.getBoldStyle() },
              site.name,
            ],
            width: 'auto',
          },
          {
            text: formattedDate,
            alignment: 'right',
            width: '*',
          },
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        columns: [
          {
            text: [
              { text: 'Ответственный: ', ...this.getBoldStyle() },
              `${site.responsible_lastname || ''} ${site.responsible_firstname || ''}`.trim() 
                ? `${site.responsible_lastname} ${site.responsible_firstname}, ${site.phone}`
                : site.phone,
            ],
            width: 'auto',
          },
          {
            text: [
              { text: 'Бонусная планка: ', ...this.getBoldStyle() },
              formatBonusTargets(site.bonus_target),
            ],
            alignment: 'right',
            width: '*',
          },
        ],
        margin: [0, 0, 0, 15] as [number, number, number, number],
      },
      {
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
      },
      {
        text: 'Результаты по сотрудникам:',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
    ];

    // Таблица с сотрудниками
    const tableBody: any[] = [];
    tableBody.push([
      { text: 'Сотрудник', ...this.getBoldStyle(), fontSize: 11 },
      { text: 'Выручка', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'QR', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'Наличные', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'Терминал', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'Зарплата', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'Бонусы/штрафы', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'Ответствен-ный (ЗП)', ...this.getBoldStyle(), alignment: 'right', fontSize: 11 },
      { text: 'Подпись', ...this.getBoldStyle(), alignment: 'left', fontSize: 11 },
      { text: 'Комментарий', ...this.getBoldStyle(), alignment: 'left', fontSize: 11 },
    ]);

    for (const r of reports) {
      const signatureText =
        typeof r.signature === 'string' && r.signature.trim().length > 0
          ? r.signature
          : '';
      
      // Отмечаем ответственного звездочкой
      const employeeName = r.is_responsible 
        ? `* ${r.lastname} ${r.firstname}`
        : `${r.lastname} ${r.firstname}`;

      // Рассчитываем общие бонусы/штрафы:
      // бонусы по планкам + ручные бонусы/штрафы (включая бонус за лучшую выручку +ЛВ)
      const bonusByTargets = r.bonus_by_targets || 0;
      const manualBonusPenalty = r.bonus_penalty || 0; // Включает бонус за лучшую выручку (500 ₽)
      const totalBonusPenalty = bonusByTargets + manualBonusPenalty;
      
      // Форматируем с учетом знака (целое число)
      const bonusPenaltyText = totalBonusPenalty > 0 
        ? `+${this.formatAmountInteger(totalBonusPenalty)}`
        : totalBonusPenalty < 0
        ? `-${this.formatAmountInteger(Math.abs(totalBonusPenalty))}`
        : this.formatAmountInteger(0);

      tableBody.push([
        { text: employeeName, fontSize: 11 },
        { text: this.formatAmountInteger(r.total_revenue), alignment: 'right', fontSize: 11 },
        { text: this.formatAmountInteger(r.qr_amount), alignment: 'right', fontSize: 11 },
        { text: this.formatAmountInteger(r.cash_amount), alignment: 'right', fontSize: 11 },
        {
          text: typeof r.terminal_amount === 'number'
            ? this.formatAmountInteger(r.terminal_amount)
            : '-',
          alignment: 'right',
          fontSize: 11,
        },
        { text: this.formatAmountInteger(r.salary), alignment: 'right', fontSize: 11 },
        { text: bonusPenaltyText, alignment: 'right', fontSize: 11 },
        { 
          text: r.is_responsible && r.responsible_salary_bonus 
            ? this.formatAmountInteger(r.responsible_salary_bonus) 
            : '-', 
          alignment: 'right', 
          fontSize: 11 
        },
        { text: signatureText, alignment: 'left', fontSize: 11 },
        { text: r.comment || '', alignment: 'left', fontSize: 11 },
      ]);
    }

    content.push({
      table: {
        headerRows: 1,
        widths: [80, 60, 50, 65, 63, 61, 55, 78, 'auto', '*'],
        body: tableBody,
      },
      layout: {
        // Горизонтальные линии
        hLineWidth: (i: number, node: any) => 0.5,
        hLineColor: (i: number, node: any) => '#CCCCCC',
        // Вертикальные линии
        vLineWidth: (i: number, node: any) => 0.5,
        vLineColor: (i: number, node: any) => '#CCCCCC',
      },
      margin: [0, 0, 0, 15] as [number, number, number, number],
    });

    // Сводные итоги по площадке
    content.push(
      {
        text: 'Сводные итоги по площадке:',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма по QR: ', ...this.getBoldStyle() },
          this.formatAmountInteger(totals.qr_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма наличных: ', ...this.getBoldStyle() },
          this.formatAmountInteger(totals.cash_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма по терминалу: ', ...this.getBoldStyle() },
          this.formatAmountInteger(totals.terminal_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая выручка: ', ...this.getBoldStyle() },
          this.formatAmountInteger(totals.total_revenue),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая зарплата: ', ...this.getBoldStyle() },
          this.formatAmountInteger(totals.salary),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Нал в конверте: ', ...this.getBoldStyle() },
          this.formatAmountInteger(
            totals.cash_amount - totals.total_bonuses_penalties - responsibleSalary
          ),
        ],
        margin: [0, 0, 0, 15] as [number, number, number, number],
      }
    );

    // Подписи
    content.push({
      text: 'Подписи:',
      style: 'sectionHeader',
      margin: [0, 20, 0, 10] as [number, number, number, number],
    });

    content.push(
      {
        text: [
          { text: 'Подпись ответственной: ', ...this.getBoldStyle() },
          '__________________________',
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      }
    );

    const docDefinition: TDocumentDefinitions = {
      content,
      styles: {
        header: {
          fontSize: 18,
          ...(PDFService.fontCache && (PDFService.fontCache.DejaVuSans || PDFService.fontCache.Roboto || PDFService.fontCache.Helvetica) ? { bold: true } : {}),
        },
        sectionHeader: {
          fontSize: 14,
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
        fontSize: 11,
      },
      pageSize: 'A4',
      pageOrientation: 'landscape',
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

    console.log('Creating site summary PDF document...');
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];

        pdfDoc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        pdfDoc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          console.log(`Site summary PDF generation completed, total chunks: ${chunks.length}, size: ${pdfBuffer.length} bytes`);
          resolve(pdfBuffer);
        });

        pdfDoc.on('error', (error: Error) => {
          console.error('Site summary PDF generation error (from pdfDoc):', error);
          reject(error);
        });

        pdfDoc.end();
      } catch (error) {
        console.error('Site summary PDF creation error (catch block):', error);
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

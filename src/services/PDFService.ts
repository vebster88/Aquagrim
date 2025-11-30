/**
 * Сервис для генерации PDF отчетов
 * Использует PDFMake с поддержкой кириллицы через pdfmake-unicode
 */

import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { DailyReport, Site } from '../types';
import { CalculationService } from './CalculationService';
import { getSiteById } from '../db';

export class PDFService {
  // Кэш для шрифтов
  private static fontCache: any = null;

  /**
   * Загружает шрифты Arial с поддержкой кириллицы
   * Использует Buffer напрямую для совместимости с serverless окружением
   */
  private static async loadFonts(): Promise<any> {
    if (this.fontCache) {
      return this.fontCache;
    }

    try {
      // Загружаем шрифты DejaVu Sans с поддержкой кириллицы
      // DejaVu Sans - надежный шрифт с полной поддержкой кириллицы
      const fontUrls = {
        normal: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans.ttf',
        bold: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Bold.ttf',
        italics: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Oblique.ttf',
        bolditalics: 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-BoldOblique.ttf',
      };

      // Альтернативные источники
      const altUrls = {
        normal: 'https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans.ttf',
        bold: 'https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-Bold.ttf',
        italics: 'https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-Oblique.ttf',
        bolditalics: 'https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-BoldOblique.ttf',
      };

      // Пробуем загрузить шрифты из разных источников
      let fontsLoaded = false;
      for (const urls of [fontUrls, altUrls]) {
        try {
          console.log(`Attempting to load fonts from: ${urls.normal}`);
          const [normal, bold, italics, bolditalics] = await Promise.all([
            fetch(urls.normal).then((r) => {
              console.log(`Normal font response: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch normal font:`, e);
              return null;
            }),
            fetch(urls.bold).then((r) => {
              console.log(`Bold font response: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch bold font:`, e);
              return null;
            }),
            fetch(urls.italics).then((r) => {
              console.log(`Italics font response: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch italics font:`, e);
              return null;
            }),
            fetch(urls.bolditalics).then((r) => {
              console.log(`BoldItalics font response: ${r.status} ${r.statusText}`);
              return r.ok ? r.arrayBuffer() : null;
            }).catch((e) => {
              console.warn(`Failed to fetch bolditalics font:`, e);
              return null;
            }),
          ]);

          console.log(`Fonts loaded: normal=${!!normal}, bold=${!!bold}, italics=${!!italics}, bolditalics=${!!bolditalics}`);

          if (normal && bold && italics && bolditalics) {
            // PDFMake в Node.js принимает Buffer напрямую
            this.fontCache = {
              DejaVuSans: {
                normal: Buffer.from(normal),
                bold: Buffer.from(bold),
                italics: Buffer.from(italics),
                bolditalics: Buffer.from(bolditalics),
              },
            };
            fontsLoaded = true;
            console.log('DejaVu Sans fonts loaded successfully as Buffers');
            break;
          } else {
            console.warn('Not all fonts loaded successfully, trying next source...');
          }
        } catch (error) {
          console.warn('Failed to load fonts from source:', error);
          continue;
        }
      }

      if (!fontsLoaded) {
        console.warn('Could not load DejaVu Sans fonts, PDF will be generated without custom fonts (may not support Cyrillic)');
        // Не устанавливаем fontCache, чтобы PDFMake использовал встроенные шрифты
        this.fontCache = {};
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
            { text: 'Площадка: ', bold: true },
            site.name,
          ],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          text: [
            { text: 'Дата: ', bold: true },
            formattedDate,
          ],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          text: [
            { text: 'Ответственный: ', bold: true },
            site.phone,
          ],
          margin: [0, 0, 0, 15] as [number, number, number, number],
        }
      );
    } else {
      content.push({
        text: [
          { text: 'Дата: ', bold: true },
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
          { text: 'Фамилия: ', bold: true },
          report.lastname,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Имя: ', bold: true },
          report.firstname,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: '№ QR: ', bold: true },
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
          { text: 'Сумма по QR: ', bold: true },
          CalculationService.formatAmount(report.qr_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Сумма наличных: ', bold: true },
          CalculationService.formatAmount(report.cash_amount),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      }
    );

    if (report.terminal_amount) {
      content.push({
        text: [
          { text: 'Сумма по терминалу: ', bold: true },
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
          { text: 'Общая выручка: ', bold: true },
          CalculationService.formatAmount(report.total_revenue),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Зарплата (20%): ', bold: true },
          CalculationService.formatAmount(report.salary),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      }
    );

    if (report.bonus_penalty) {
      content.push({
        text: [
          { text: 'Бонус/штраф: ', bold: true },
          CalculationService.formatAmount(report.bonus_penalty),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      });
    }

    content.push(
      {
        text: [
          { text: 'Зарплата ответственного: ', bold: true },
          CalculationService.formatAmount(report.responsible_salary),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общий оборот за день: ', bold: true },
          CalculationService.formatAmount(report.total_daily),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма наличных: ', bold: true },
          CalculationService.formatAmount(report.total_cash),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Общая сумма по QR: ', bold: true },
          CalculationService.formatAmount(report.total_qr),
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        text: [
          { text: 'Нал в конверте: ', bold: true },
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

    if (report.signature) {
      content.push({
        text: [
          { text: 'Подпись: ', bold: true },
          report.signature,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      });
    }

    if (report.responsible_signature) {
      content.push({
        text: [
          { text: 'Подпись ответственного: ', bold: true },
          report.responsible_signature,
        ],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      });
    }

    const docDefinition: TDocumentDefinitions = {
      content,
      styles: {
        header: {
          fontSize: 20,
          bold: true,
        },
        sectionHeader: {
          fontSize: 16,
          bold: true,
          decoration: 'underline',
        },
      },
      defaultStyle: {
        ...(PDFService.fontCache && PDFService.fontCache.DejaVuSans ? { font: 'DejaVuSans' } : {}),
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

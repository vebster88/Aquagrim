/**
 * Сервис для генерации PDF отчетов
 */

import PDFDocument from 'pdfkit';
import { DailyReport, Site } from '../types';
import { CalculationService } from './CalculationService';
import { getSiteById } from '../db';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class PDFService {
  // URL шрифта DejaVu Sans с поддержкой кириллицы
  // Пробуем несколько источников для надежности
  private static readonly CYRILLIC_FONT_URLS = [
    'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@master/ttf/DejaVuSans.ttf',
    'https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans.ttf',
    'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans.ttf',
  ];
  
  // Кэш для шрифта (чтобы не загружать каждый раз)
  private static fontBuffer: Buffer | null = null;
  
  /**
   * Загружает шрифт с поддержкой кириллицы
   */
  private static async loadCyrillicFont(): Promise<Buffer> {
    if (this.fontBuffer) {
      return this.fontBuffer;
    }
    
    // Пробуем загрузить шрифт из разных источников
    for (const url of this.CYRILLIC_FONT_URLS) {
      try {
        console.log(`Attempting to load font from: ${url}`);
        // Используем встроенный fetch (доступен в Node.js 18+ и Vercel)
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
        });
        
        if (!response.ok) {
          console.warn(`Failed to load font from ${url}: ${response.statusText}`);
          continue;
        }
        
        // Получаем данные как ArrayBuffer и конвертируем в Buffer
        const arrayBuffer = await response.arrayBuffer();
        this.fontBuffer = Buffer.from(arrayBuffer);
        
        if (this.fontBuffer.length > 0) {
          console.log(`Successfully loaded font from ${url}, size: ${this.fontBuffer.length} bytes`);
          return this.fontBuffer;
        }
      } catch (error) {
        console.warn(`Error loading font from ${url}:`, error);
        continue;
      }
    }
    
    // Если все источники не сработали, выбрасываем ошибку
    throw new Error('Failed to load Cyrillic font from all sources');
  }
  
  /**
   * Генерирует PDF отчет по площадке и дню
   */
  static async generateReportPDF(report: DailyReport, site?: Site): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      autoFirstPage: true,
    });
    
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    
    // Загружаем и регистрируем шрифт с поддержкой кириллицы
    let fontLoaded = false;
    let tempFontPath: string | null = null;
    
    try {
      const fontBuffer = await this.loadCyrillicFont();
      
      if (!fontBuffer || fontBuffer.length === 0) {
        throw new Error('Font buffer is empty');
      }
      
      // PDFKit требует путь к файлу, а не Buffer
      // Создаем временный файл для шрифта
      const tempDir = os.tmpdir();
      tempFontPath = path.join(tempDir, `dejavu-sans-${Date.now()}.ttf`);
      fs.writeFileSync(tempFontPath, fontBuffer);
      
      // Регистрируем шрифт по пути к файлу
      doc.registerFont('CyrillicFont', tempFontPath);
      
      // Устанавливаем шрифт для всего документа
      doc.font('CyrillicFont');
      fontLoaded = true;
      console.log('Cyrillic font registered and set successfully');
    } catch (error) {
      console.error('Could not load Cyrillic font, using default font:', error);
      // Используем стандартный шрифт, если не удалось загрузить
      // В этом случае кириллица может отображаться неправильно
      fontLoaded = false;
    }
    
    // Очистка временного файла после завершения
    const cleanup = () => {
      if (tempFontPath && fs.existsSync(tempFontPath)) {
        try {
          fs.unlinkSync(tempFontPath);
        } catch (err) {
          console.warn('Failed to cleanup temp font file:', err);
        }
      }
    };
    
    // Очищаем файл после завершения генерации PDF
    doc.on('end', cleanup);
    
    // Вспомогательная функция для безопасного вывода текста
    const safeText = (text: string | undefined | null): string => {
      if (!text) return '';
      return String(text);
    };
    
    // Заголовок
    doc.fontSize(20);
    doc.text(safeText('Отчет по площадке'), { align: 'center' });
    doc.moveDown();
    
    // Информация о площадке
    if (site) {
      doc.fontSize(14);
      doc.text(`${safeText('Площадка')}: ${safeText(site.name)}`, { align: 'left' });
      doc.text(`${safeText('Дата')}: ${safeText(this.formatDate(report.date))}`, { align: 'left' });
      doc.text(`${safeText('Ответственный')}: ${safeText(site.phone)}`, { align: 'left' });
      doc.moveDown();
    } else {
      doc.fontSize(14);
      doc.text(`${safeText('Дата')}: ${safeText(this.formatDate(report.date))}`, { align: 'left' });
      doc.moveDown();
    }
    
    // Разделитель
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    
    // Данные сотрудника
    doc.fontSize(16);
    doc.text(safeText('Данные сотрудника:'), { underline: true });
    doc.fontSize(12);
    doc.text(`${safeText('Фамилия')}: ${safeText(report.lastname)}`);
    doc.text(`${safeText('Имя')}: ${safeText(report.firstname)}`);
    doc.text(`${safeText('№ QR')}: ${safeText(report.qr_number)}`);
    doc.moveDown();
    
    // Финансовые данные
    doc.fontSize(16);
    doc.text(safeText('Финансовые показатели:'), { underline: true });
    doc.fontSize(12);
    doc.text(`${safeText('Сумма по QR')}: ${CalculationService.formatAmount(report.qr_amount)}`);
    doc.text(`${safeText('Сумма наличных')}: ${CalculationService.formatAmount(report.cash_amount)}`);
    if (report.terminal_amount) {
      doc.text(`${safeText('Сумма по терминалу')}: ${CalculationService.formatAmount(report.terminal_amount)}`);
    }
    doc.moveDown();
    
    // Рассчитанные показатели
    doc.fontSize(16);
    doc.text(safeText('Расчеты:'), { underline: true });
    doc.fontSize(12);
    doc.text(`${safeText('Общая выручка')}: ${CalculationService.formatAmount(report.total_revenue)}`);
    doc.text(`${safeText('Зарплата (20%)')}: ${CalculationService.formatAmount(report.salary)}`);
    if (report.bonus_penalty) {
      doc.text(`${safeText('Бонус/штраф')}: ${CalculationService.formatAmount(report.bonus_penalty)}`);
    }
    doc.text(`${safeText('Зарплата ответственного')}: ${CalculationService.formatAmount(report.responsible_salary)}`);
    doc.text(`${safeText('Общий оборот за день')}: ${CalculationService.formatAmount(report.total_daily)}`);
    doc.text(`${safeText('Общая сумма наличных')}: ${CalculationService.formatAmount(report.total_cash)}`);
    doc.text(`${safeText('Общая сумма по QR')}: ${CalculationService.formatAmount(report.total_qr)}`);
    doc.text(`${safeText('Нал в конверте')}: ${CalculationService.formatAmount(report.cash_in_envelope)}`);
    doc.moveDown();
    
    // Комментарий
    if (report.comment) {
      doc.fontSize(16);
      doc.text(safeText('Комментарий:'), { underline: true });
      doc.fontSize(12);
      doc.text(safeText(report.comment));
      doc.moveDown();
    }
    
    // Подписи
    doc.moveDown(2);
    doc.fontSize(14);
    doc.text(safeText('Подписи:'), { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    if (report.signature) {
      doc.text(`${safeText('Подпись')}: ${safeText(report.signature)}`);
    }
    if (report.responsible_signature) {
      doc.text(`${safeText('Подпись ответственного')}: ${safeText(report.responsible_signature)}`);
    }
    
    // Футер
    doc.fontSize(10);
    doc.text(
      `${safeText('Отчет создан')}: ${safeText(this.formatDate(new Date().toISOString()))}`,
      50,
      doc.page.height - 50,
      {
        align: 'left',
      }
    );
    
    doc.end();
    
    return new Promise((resolve) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
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

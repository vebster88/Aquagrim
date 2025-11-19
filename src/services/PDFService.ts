/**
 * Сервис для генерации PDF отчетов
 */

import PDFDocument from 'pdfkit';
import { DailyReport, Site } from '../types';
import { CalculationService } from './CalculationService';
import { getSiteById } from '../db';

export class PDFService {
  /**
   * Генерирует PDF отчет по площадке и дню
   */
  static async generateReportPDF(report: DailyReport, site?: Site): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    
    // Заголовок
    doc.fontSize(20).text('Отчет по площадке', { align: 'center' });
    doc.moveDown();
    
    // Информация о площадке
    if (site) {
      doc.fontSize(14).text(`Площадка: ${site.name}`, { align: 'left' });
      doc.text(`Дата: ${this.formatDate(report.date)}`, { align: 'left' });
      doc.text(`Ответственный: ${site.phone}`, { align: 'left' });
      doc.moveDown();
    } else {
      doc.fontSize(14).text(`Дата: ${this.formatDate(report.date)}`, { align: 'left' });
      doc.moveDown();
    }
    
    // Разделитель
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    
    // Данные сотрудника
    doc.fontSize(16).text('Данные сотрудника:', { underline: true });
    doc.fontSize(12);
    doc.text(`Фамилия: ${report.lastname}`);
    doc.text(`Имя: ${report.firstname}`);
    doc.text(`№ QR: ${report.qr_number}`);
    doc.moveDown();
    
    // Финансовые данные
    doc.fontSize(16).text('Финансовые показатели:', { underline: true });
    doc.fontSize(12);
    doc.text(`Сумма по QR: ${CalculationService.formatAmount(report.qr_amount)}`);
    doc.text(`Сумма наличных: ${CalculationService.formatAmount(report.cash_amount)}`);
    if (report.terminal_amount) {
      doc.text(`Сумма по терминалу: ${CalculationService.formatAmount(report.terminal_amount)}`);
    }
    doc.moveDown();
    
    // Рассчитанные показатели
    doc.fontSize(16).text('Расчеты:', { underline: true });
    doc.fontSize(12);
    doc.text(`Общая выручка: ${CalculationService.formatAmount(report.total_revenue)}`);
    doc.text(`Зарплата (20%): ${CalculationService.formatAmount(report.salary)}`);
    if (report.bonus_penalty) {
      doc.text(`Бонус/штраф: ${CalculationService.formatAmount(report.bonus_penalty)}`);
    }
    doc.text(`Зарплата ответственного: ${CalculationService.formatAmount(report.responsible_salary)}`);
    doc.text(`Общий оборот за день: ${CalculationService.formatAmount(report.total_daily)}`);
    doc.text(`Общая сумма наличных: ${CalculationService.formatAmount(report.total_cash)}`);
    doc.text(`Общая сумма по QR: ${CalculationService.formatAmount(report.total_qr)}`);
    doc.text(`Нал в конверте: ${CalculationService.formatAmount(report.cash_in_envelope)}`);
    doc.moveDown();
    
    // Комментарий
    if (report.comment) {
      doc.fontSize(16).text('Комментарий:', { underline: true });
      doc.fontSize(12).text(report.comment);
      doc.moveDown();
    }
    
    // Подписи
    doc.moveDown(2);
    doc.fontSize(14).text('Подписи:', { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    if (report.signature) {
      doc.text(`Подпись: ${report.signature}`);
    }
    if (report.responsible_signature) {
      doc.text(`Подпись ответственного: ${report.responsible_signature}`);
    }
    
    // Футер
    doc.fontSize(10)
      .text(`Отчет создан: ${this.formatDate(new Date().toISOString())}`, 50, doc.page.height - 50, {
        align: 'left',
      });
    
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


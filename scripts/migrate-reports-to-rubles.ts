import 'dotenv/config';
import { kv } from '@vercel/kv';
import { DailyReport } from '../src/types';

async function main() {
  console.log('Starting one-time migration of DailyReport sums from kopecks to rubles...');

  const kvClient = kv;
  const counterKey = 'counter:report:';
  const prefixReport = 'report:';

  // Пытаемся определить максимальный ID отчета по счетчику
  const maxIdRaw = await kvClient.get(counterKey);
  const maxId = typeof maxIdRaw === 'number' ? maxIdRaw : Number(maxIdRaw || 0);

  if (!maxId || maxId <= 0) {
    console.log('No reports found (counter is empty). Nothing to migrate.');
    return;
  }

  console.log(`Detected max report counter: ${maxId}`);

  let migrated = 0;
  let skippedAlreadyMigrated = 0;
  let skippedNoData = 0;

  for (let i = 1; i <= maxId; i++) {
    const id = `report_${i}`;
    const key = `${prefixReport}${id}`;

    const data = await kvClient.get<DailyReport | null>(key);
    if (!data) {
      skippedNoData++;
      continue;
    }

    const report = data as DailyReport;

    // Уже помечен как мигрированный — ничего не делаем
    if (report.migrated_to_rubles) {
      skippedAlreadyMigrated++;
      continue;
    }

    const amounts: number[] = [];
    amounts.push(report.qr_amount);
    amounts.push(report.cash_amount);
    if (typeof report.terminal_amount === 'number') {
      amounts.push(report.terminal_amount);
    }
    amounts.push(report.total_revenue);
    amounts.push(report.salary);
    if (typeof report.bonus_penalty === 'number') {
      amounts.push(report.bonus_penalty);
    }
    amounts.push(report.responsible_salary);
    amounts.push(report.total_daily);
    amounts.push(report.total_cash);
    amounts.push(report.total_qr);
    amounts.push(report.cash_in_envelope);

    const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;

    // Евристика такая же, как в normalizeReportMoney:
    // если суммы явно слишком большие — считаем, что это копейки
    if (!Number.isFinite(maxAmount) || maxAmount <= 100_000) {
      // Считаем, что этот отчет уже в рублях, просто помечаем флагом
      report.migrated_to_rubles = true;
      await kvClient.set(key, report);
      migrated++;
      continue;
    }

    const divisor = 100;

    const updated: DailyReport = {
      ...report,
      qr_amount: report.qr_amount / divisor,
      cash_amount: report.cash_amount / divisor,
      terminal_amount:
        typeof report.terminal_amount === 'number'
          ? report.terminal_amount / divisor
          : report.terminal_amount,
      total_revenue: report.total_revenue / divisor,
      salary: report.salary / divisor,
      bonus_penalty:
        typeof report.bonus_penalty === 'number'
          ? report.bonus_penalty / divisor
          : report.bonus_penalty,
      responsible_salary: report.responsible_salary / divisor,
      total_daily: report.total_daily / divisor,
      total_cash: report.total_cash / divisor,
      total_qr: report.total_qr / divisor,
      cash_in_envelope: report.cash_in_envelope / divisor,
      migrated_to_rubles: true,
    };

    await kvClient.set(key, updated);
    migrated++;

    if (migrated % 50 === 0) {
      console.log(`Migrated ${migrated} reports so far... (id=${id})`);
    }
  }

  console.log('Migration finished.');
  console.log(`Migrated/marked reports: ${migrated}`);
  console.log(`Skipped (already migrated): ${skippedAlreadyMigrated}`);
  console.log(`Skipped (no data under expected key): ${skippedNoData}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});



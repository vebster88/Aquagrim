/**
 * Обертка над Vercel KV для работы с хранилищем
 */

import { kv } from '@vercel/kv';
import { config } from '../config';
import { User, Session, Site, DailyReport, Log } from '../types';

// Инициализация KV клиента
let kvClient: any = null;

export function initKV() {
  if (!kvClient) {
    // Vercel KV автоматически использует переменные окружения
    // KV_REST_API_URL и KV_REST_API_TOKEN
    kvClient = kv;
  }
  return kvClient;
}

// Префиксы для ключей
const PREFIXES = {
  user: 'user:',
  userByTelegram: 'user:tg:',
  session: 'session:',
  site: 'site:',
  siteByDate: 'site:date:',
  report: 'report:',
  reportBySite: 'report:site:',
  reportByLastname: 'report:lastname:',
  log: 'log:',
  counter: 'counter:',
};

// Генерация ID
async function generateId(prefix: string): Promise<string> {
  const key = `${PREFIXES.counter}${prefix}`;
  const id = await kvClient.incr(key);
  return `${prefix}_${id}`;
}

// ========== User ==========

export async function getUserById(id: string): Promise<User | null> {
  const data = await kvClient.get(`${PREFIXES.user}${id}`);
  return data ? (data as User) : null;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const userId = await kvClient.get(`${PREFIXES.userByTelegram}${telegramId}`);
  if (!userId) return null;
  return getUserById(userId as string);
}

export async function createUser(telegramId: number, username?: string, phone?: string): Promise<User> {
  const id = await generateId('user');
  const user: User = {
    id,
    telegram_id: telegramId,
    username,
    phone,
    role: config.isSuperadmin(telegramId) ? 'superadmin' : 'user',
    created_at: new Date().toISOString(),
  };
  
  await kvClient.set(`${PREFIXES.user}${id}`, user);
  await kvClient.set(`${PREFIXES.userByTelegram}${telegramId}`, id);
  
  return user;
}

export async function updateUser(user: User): Promise<void> {
  await kvClient.set(`${PREFIXES.user}${user.id}`, user);
}

// ========== Session ==========

export async function getSession(userId: string): Promise<Session | null> {
  const data = await kvClient.get(`${PREFIXES.session}${userId}`);
  return data ? (data as Session) : null;
}

export async function createOrUpdateSession(
  userId: string,
  state: Session['state'],
  context: Record<string, any> = {}
): Promise<Session> {
  const existing = await getSession(userId);
  
  const session: Session = {
    id: existing?.id || `session_${userId}`,
    user_id: userId,
    state,
    context: { ...existing?.context, ...context },
    updated_at: new Date().toISOString(),
  };
  
  await kvClient.set(`${PREFIXES.session}${userId}`, session);
  return session;
}

export async function clearSession(userId: string): Promise<void> {
  await kvClient.del(`${PREFIXES.session}${userId}`);
}

// ========== Site ==========

export async function getSiteById(id: string): Promise<Site | null> {
  const data = await kvClient.get(`${PREFIXES.site}${id}`);
  return data ? (data as Site) : null;
}

export async function getSitesByDate(date: string): Promise<Site[]> {
  const siteIds = await kvClient.smembers(`${PREFIXES.siteByDate}${date}`);
  if (!siteIds || siteIds.length === 0) return [];
  
  const sites = await Promise.all(
    (siteIds as string[]).map(id => getSiteById(id))
  );
  return sites.filter(site => site !== null) as Site[];
}

export async function createSite(site: Omit<Site, 'id' | 'created_at' | 'updated_at'>): Promise<Site> {
  const id = await generateId('site');
  const now = new Date().toISOString();
  
  const newSite: Site = {
    ...site,
    id,
    created_at: now,
    updated_at: now,
  };
  
  await kvClient.set(`${PREFIXES.site}${id}`, newSite);
  await kvClient.sadd(`${PREFIXES.siteByDate}${site.date}`, id);
  
  return newSite;
}

export async function updateSite(site: Site): Promise<void> {
  const updated = {
    ...site,
    updated_at: new Date().toISOString(),
  };
  await kvClient.set(`${PREFIXES.site}${site.id}`, updated);
}

// ========== DailyReport ==========

export async function getReportById(id: string): Promise<DailyReport | null> {
  const data = await kvClient.get(`${PREFIXES.report}${id}`);
  return data ? (data as DailyReport) : null;
}

export async function getReportsBySite(siteId: string, date: string): Promise<DailyReport[]> {
  const reportIds = await kvClient.smembers(`${PREFIXES.reportBySite}${siteId}:${date}`);
  if (!reportIds || reportIds.length === 0) return [];
  
  const reports = await Promise.all(
    (reportIds as string[]).map(id => getReportById(id))
  );
  return reports.filter(report => report !== null) as DailyReport[];
}

export async function getReportsByLastname(lastname: string): Promise<DailyReport[]> {
  const reportIds = await kvClient.smembers(`${PREFIXES.reportByLastname}${lastname.toLowerCase()}`);
  if (!reportIds || reportIds.length === 0) return [];
  
  const reports = await Promise.all(
    (reportIds as string[]).map(id => getReportById(id))
  );
  return reports.filter(report => report !== null) as DailyReport[];
}

export async function createReport(report: Omit<DailyReport, 'id' | 'created_at' | 'updated_at'>): Promise<DailyReport> {
  const id = await generateId('report');
  const now = new Date().toISOString();
  
  const newReport: DailyReport = {
    ...report,
    id,
    created_at: now,
    updated_at: now,
  };
  
  await kvClient.set(`${PREFIXES.report}${id}`, newReport);
  await kvClient.sadd(`${PREFIXES.reportBySite}${report.site_id}:${report.date}`, id);
  await kvClient.sadd(`${PREFIXES.reportByLastname}${report.lastname.toLowerCase()}`, id);
  
  return newReport;
}

export async function updateReport(report: DailyReport): Promise<void> {
  const updated = {
    ...report,
    updated_at: new Date().toISOString(),
  };
  await kvClient.set(`${PREFIXES.report}${report.id}`, updated);
}

// ========== Log ==========

export async function createLog(
  userId: string,
  actionType: Log['action_type'],
  payloadBefore?: any,
  payloadAfter?: any
): Promise<Log> {
  const id = await generateId('log');
  const log: Log = {
    id,
    user_id: userId,
    action_type: actionType,
    payload_before: payloadBefore,
    payload_after: payloadAfter,
    timestamp: new Date().toISOString(),
  };
  
  await kvClient.set(`${PREFIXES.log}${id}`, log);
  // Также сохраняем индекс по пользователю для быстрого поиска
  await kvClient.lpush(`logs:user:${userId}`, id);
  
  return log;
}


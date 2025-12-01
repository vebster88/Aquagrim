/**
 * Типы и интерфейсы для сущностей системы
 */

export type UserRole = 'user' | 'admin' | 'superadmin';

export interface User {
  id: string;
  telegram_id: number;
  username?: string;
  phone?: string;
  role: UserRole;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  state: DialogState;
  last_message?: number;
  context: Record<string, any>;
  updated_at: string;
}

export type DialogState =
  | 'idle'
  | 'morning_fill_site_name'
  | 'morning_fill_bonus_target'
  | 'morning_fill_phone'
  | 'evening_fill_lastname'
  | 'evening_fill_firstname'
  | 'evening_fill_qr_number'
  | 'evening_fill_qr_amount'
  | 'evening_fill_cash_amount'
  | 'evening_fill_terminal_amount'
  | 'evening_fill_comment'
  | 'evening_fill_confirm'
  | 'evening_fill_signature'
  | 'evening_fill_responsible_signature'
  | 'edit_by_lastname_select'
  | 'edit_by_lastname_input'
  | 'edit_by_site_select'
  | 'edit_by_site_date'
  | 'edit_field'
  | 'admin_view_sites'
  | 'admin_select_site'
  | 'admin_select_date'
  | 'admin_add_admin'
  | 'confirm_cancel';

export interface Site {
  id: string;
  name: string;
  responsible_user_id: string;
  bonus_target: string; // строка с бонусными планками через запятую (в рублях, например: "1000,2000,3000")
  phone: string;
  date: string; // YYYY-MM-DD
  status: 'morning_filled' | 'evening_filled' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface DailyReport {
  id: string;
  site_id: string;
  date: string; // YYYY-MM-DD
  lastname: string;
  firstname: string;
  qr_number: string;
  qr_amount: number; // в рублях
  cash_amount: number; // в рублях
  terminal_amount?: number; // в рублях, необязательно
  comment?: string;
  signature?: string;
  responsible_signature?: string;
  // Рассчитанные поля
  total_revenue: number; // в рублях
  salary: number; // в рублях (20% от выручки)
  bonus_penalty?: number; // в рублях, ручное поле
  responsible_salary: number; // в рублях
  total_daily: number; // в рублях (оборот)
  total_cash: number; // в рублях
  total_qr: number; // в рублях
  cash_in_envelope: number; // в рублях (нал в конверте с вычетом бонусов)
  pdf_url?: string;
  created_at: string;
  updated_at: string;
  /**
   * Служебное поле для миграции: true, если отчет уже приведен к рублям.
   */
  migrated_to_rubles?: boolean;
}

export interface Log {
  id: string;
  user_id: string;
  action_type: LogActionType;
  payload_before?: any;
  payload_after?: any;
  timestamp: string;
}

export type LogActionType =
  | 'user_created'
  | 'morning_fill_started'
  | 'morning_fill_completed'
  | 'evening_fill_started'
  | 'evening_fill_completed'
  | 'field_edited'
  | 'admin_added'
  | 'admin_removed'
  | 'report_viewed'
  | 'pdf_generated';

export interface CalculationResult {
  total_revenue: number;
  salary: number;
  bonus_penalty?: number;
  responsible_salary: number;
  total_daily: number;
  total_cash: number;
  total_qr: number;
  cash_in_envelope: number;
}

export interface EditContext {
  mode: 'by_lastname' | 'by_site';
  report_id?: string;
  site_id?: string;
  date?: string;
  lastname?: string;
  current_field?: string;
  field_index?: number;
}


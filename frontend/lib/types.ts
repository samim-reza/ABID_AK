export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface CurrentUser {
  id: number;
  username: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
}

export interface Person {
  id: number;
  name: string;
  role: string;
  department: string;
  passport_number: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface PersonSummary {
  id: number;
  name: string;
  role: string;
  department: string;
  total_amount: number;
  total_vat: number;
  grand_total: number;
  expense_count: number;
}

export interface Expense {
  id: number;
  person_id: number;
  person_name: string | null;
  category: string;
  reason: string;
  barcode: string | null;
  amount: number;
  vat_applied: boolean;
  vat_amount: number;
  total: number;
  expense_date: string;
  month: number;
  year: number;
}

export interface CategorySummary {
  category: string;
  total_amount: number;
  total_vat: number;
  grand_total: number;
  expense_count: number;
}

export interface Salary {
  id: number;
  person_id: number;
  person_name: string | null;
  role: string;
  passport_number: string;
  pay_type: string;
  amount: number;
  pay_date: string;
  month: number;
  year: number;
  note: string | null;
}

export interface Activity {
  id: number;
  username: string;
  action: string;
  entity: string;
  entity_id: number | null;
  description: string;
  created_at: string;
}

export interface Role {
  id: number;
  name: string;
  department: string;
}

export interface DashboardStats {
  total_expenses: number;
  total_vat: number;
  grand_total: number;
  total_salaries: number;
  expense_count: number;
  salary_count: number;
  person_count: number;
  top_persons: PersonSummary[];
  top_categories: CategorySummary[];
}

export interface MonthlyPoint {
  year: number;
  month: number;
  label: string;
  expenses: number;
  vat: number;
  salaries: number;
}

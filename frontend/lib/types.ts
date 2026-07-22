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
  email: string | null;
  location: "inside" | "outside";
  is_active: boolean;
}

export interface Project {
  id: number;
  company_id: number;
  name: string;
  worker_count: number;
}

export interface Company {
  id: number;
  name: string;
  projects: Project[];
  worker_count: number;
}

export interface Worker {
  id: number;
  name: string;
  nationality: string;
  passport_number: string | null;
  iqama_number: string | null;
  iqama_expiry: string | null;
  phone: string | null;
  company_id: number;
  project_id: number;
  pay_type: "monthly" | "hourly";
  base_rate: number;
  note: string | null;
  is_released: boolean;
  released_at: string | null;
  company_name: string | null;
  project_name: string | null;
}

export interface WorkerSalary {
  id: number;
  worker_id: number;
  worker_name: string | null;
  year: number;
  month: number;
  basic_amount: number;
  overtime_hours: number | null;
  overtime_amount: number;
  advance_amount: number;
  hours: number | null;
  net_amount: number;
  paid: boolean;
  pay_date: string | null;
  note: string | null;
}

export interface PayrollRow {
  worker_id: number;
  name: string;
  nationality: string;
  company_name: string | null;
  project_name: string | null;
  pay_type: "monthly" | "hourly";
  base_rate: number;
  is_released: boolean;
  salary_id: number | null;
  suggested_basic: number;
  basic_amount: number;
  overtime_hours: number | null;
  overtime_amount: number;
  advance_amount: number;
  net_amount: number;
  paid: boolean;
  has_record: boolean;
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

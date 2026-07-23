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
  iqama_number: string | null;
  iqama_expiry: string | null;
  phone: string | null;
  email: string | null;
  location: "inside" | "outside";
  monthly_salary: number;
  is_active: boolean;
}

export interface PersonSalary {
  id: number;
  person_id: number;
  person_name: string | null;
  year: number;
  month: number;
  salary_amount: number;
  advance_amount: number;
  net_amount: number;
  paid: boolean;
  pay_date: string | null;
  note: string | null;
}

export interface PersonPayrollRow {
  person_id: number;
  name: string;
  role: string;
  department: string;
  location: "inside" | "outside";
  monthly_salary: number;
  is_active: boolean;
  salary_id: number | null;
  suggested_salary: number;
  salary_amount: number;
  advance_amount: number;
  net_amount: number;
  paid: boolean;
  has_record: boolean;
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

/* ---------- Invoice archive (standalone: never mixed with expenses/payroll) ---------- */
export interface Invoice {
  id: number;
  company_id: number;
  company_name: string | null;
  invoice_number: string | null;
  description: string;
  amount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  invoice_date: string;
  month: number;
  year: number;
  file_name: string;
  file_size: number;
  created_at: string;
}

export interface InvoiceCompanySummary {
  company_id: number;
  company_name: string;
  invoice_count: number;
  total_amount: number;
  total_vat: number;
  grand_total: number;
}

export interface InvoiceTotals {
  invoice_count: number;
  total_amount: number;
  total_vat: number;
  grand_total: number;
}

// ---------- Accounting ----------
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: number | null;
  is_group: boolean;
  is_active: boolean;
  description: string;
  normal_balance: "debit" | "credit";
}

export interface AccountNode extends Account {
  balance: number;
  children: AccountNode[];
}

export interface JournalLine {
  id: number;
  account_id: number;
  account_code: string | null;
  account_name: string | null;
  line_no: number;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: number;
  entry_no: string;
  entry_date: string;
  year: number;
  month: number;
  memo: string;
  reference: string | null;
  source: string;
  status: "draft" | "posted" | "void";
  total_debit: number;
  total_credit: number;
  posted_at: string | null;
  created_at: string;
  lines: JournalLine[];
}

export interface FiscalPeriod {
  id: number;
  year: number;
  month: number;
  is_closed: boolean;
  closed_at: string | null;
}

export interface TrialBalanceRow {
  account_id: number;
  code: string;
  name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  from_date: string;
  to_date: string;
  rows: TrialBalanceRow[];
  total_debit: number;
  total_credit: number;
}

export interface LedgerLine {
  date: string;
  entry_no: string;
  entry_id: number;
  memo: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface GeneralLedger {
  account_id: number;
  code: string;
  name: string;
  normal_balance: "debit" | "credit";
  from_date: string;
  to_date: string;
  opening_balance: number;
  lines: LedgerLine[];
  closing_balance: number;
}

export interface ReportLine {
  account_id: number;
  code: string;
  name: string;
  amount: number;
}

export interface ReportSection {
  title: string;
  lines: ReportLine[];
  total: number;
}

export interface IncomeStatement {
  from_date: string;
  to_date: string;
  income: ReportSection;
  expenses: ReportSection;
  net_profit: number;
}

export interface BalanceSheet {
  as_of: string;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  net_profit: number;
  total_assets: number;
  total_liabilities_equity: number;
  balanced: boolean;
}

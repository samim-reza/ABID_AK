// Company details sourced from the ABID AK business card & manpower document.
export const COMPANY = {
  name: "ABID AK Contracting Company",
  nameArabic: "شركة أبيد إيه كي كونتراكتينغ",
  tagline: "Contracting • Construction • Manpower Solutions",
  ceoName: "Abid Chowdhury",
  ceoRole: "Chief Executive Officer (CEO)",
  phone: "059 735 8693",
  phoneIntl: "+966597358693",
  email: "ceo@abidsa.com",
  website: "www.abidsa.com",
  websiteUrl: "https://www.abidsa.com",
  address: "Jubail, Al Safat Dist., Saudi Arabia",
  fullAddress: "Al-Jubail 31951, P.O. Box 61149, Kingdom of Saudi Arabia",
  cr: "7053945379",
  currency: "SAR",
  vatRate: 0.15,
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/expenses", label: "Expenses", icon: "receipt" },
  { href: "/persons", label: "Office Staff", icon: "users" },
  { href: "/workers", label: "Workers", icon: "hardhat" },
  { href: "/salaries", label: "Payroll", icon: "wallet" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/users", label: "System Users", icon: "shield", adminOnly: true },
];

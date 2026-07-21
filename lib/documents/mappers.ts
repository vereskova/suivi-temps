import { CompanyDoc, EmployeeDoc, Sex } from "./types";

export type EmployeeConfidentialRow = {
  nationality: string | null;
  securite_sociale: string | null;
  monthly_gross_salary: number | null;
};

export type EmployeeRow = {
  first_name: string;
  last_name: string;
  sex: Sex;
  category: "chantier" | "bureau";
  date_of_birth: string | null;
  birth_place: string | null;
  address: string | null;
  hire_date: string | null;
  job_title: string | null;
  classification: string | null;
  classe: string | null;
  weekly_hours: number | null;
  employee_confidential: EmployeeConfidentialRow | EmployeeConfidentialRow[] | null;
};

export type CompanyRow = {
  name: string;
  legal_form: string;
  siret: string;
  naf_code: string;
  address: string;
  signing_city: string;
  representative_name: string;
  representative_title: string;
  representative_sex: Sex;
  convention_collective: string;
  mutuelle_provider: string;
};

export const EMPLOYEE_DOC_SELECT =
  "id, first_name, last_name, sex, category, date_of_birth, birth_place, address, hire_date, job_title, classification, classe, weekly_hours, employee_confidential(nationality, securite_sociale, monthly_gross_salary)";

export function mapEmployeeRow(row: EmployeeRow): EmployeeDoc {
  const confidential = Array.isArray(row.employee_confidential)
    ? row.employee_confidential[0]
    : row.employee_confidential;

  return {
    firstName: row.first_name,
    lastName: row.last_name,
    fullNameUpper: `${row.last_name.toUpperCase()} ${row.first_name}`,
    sex: row.sex,
    dateOfBirth: row.date_of_birth,
    birthPlace: row.birth_place,
    nationality: confidential?.nationality ?? null,
    address: row.address,
    socialSecurity: confidential?.securite_sociale ?? null,
    jobTitle: row.job_title,
    category: row.category,
    hireDate: row.hire_date,
    weeklyHours: row.weekly_hours,
    classification: row.classification,
    classe: row.classe,
    monthlyGrossSalary: confidential?.monthly_gross_salary ?? null,
  };
}

export function mapCompanyRow(row: CompanyRow): CompanyDoc {
  return {
    name: row.name,
    legalForm: row.legal_form,
    siret: row.siret,
    nafCode: row.naf_code,
    address: row.address,
    signingCity: row.signing_city,
    representativeName: row.representative_name,
    representativeTitle: row.representative_title,
    representativeSex: row.representative_sex,
    conventionCollective: row.convention_collective,
    mutuelleProvider: row.mutuelle_provider,
  };
}

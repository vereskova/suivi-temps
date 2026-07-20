export type Run = { text: string; bold?: boolean; italic?: boolean };

export type Block =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; runs: Run[]; center?: boolean }
  | { type: "spacer" }
  | { type: "list"; items: string[] };

export type DocContent = {
  /** Used as the download filename base (sanitized) and as a fallback title. */
  title: string;
  blocks: Block[];
};

export function t(text: string): Run {
  return { text };
}

export function b(text: string): Run {
  return { text, bold: true };
}

/** Paragraph built from plain/bold runs, e.g. p(t("Salaire: "), b("1 800 €")). */
export function p(...runs: Run[]): Block {
  return { type: "paragraph", runs };
}

/** Single-run paragraph shorthand. */
export function para(text: string): Block {
  return { type: "paragraph", runs: [{ text }] };
}

export function centered(text: string): Block {
  return { type: "paragraph", runs: [{ text }], center: true };
}

export type EmployeeDoc = {
  firstName: string;
  lastName: string;
  fullNameUpper: string; // "NOM Prénom" as used in salutations
  dateOfBirth: string | null;
  birthPlace: string | null;
  nationality: string | null;
  address: string | null;
  socialSecurity: string | null;
  jobTitle: string | null;
  category: "chantier" | "bureau";
  hireDate: string | null;
  weeklyHours: number | null;
  classification: string | null;
  monthlyGrossSalary: number | null;
};

export type CompanyDoc = {
  name: string;
  legalForm: string;
  siret: string;
  nafCode: string;
  address: string;
  signingCity: string;
  representativeName: string;
  representativeTitle: string;
  conventionCollective: string;
};

export type Run = { text: string; bold?: boolean; italic?: boolean };

export type Align = "left" | "center" | "right";

/** One side of a dual-party signature block (e.g. "L'Employeur" / "Le/La salarié(e)"). */
export type SignatureParty = { label: string; lines: string[] };

export type Block =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; runs: Run[]; align?: Align }
  | { type: "spacer" }
  | { type: "rule" }
  | { type: "list"; items: string[] }
  | { type: "signatureBlock"; left: SignatureParty; right: SignatureParty };

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

/** Single-run paragraph shorthand. Body paragraphs justify by default; pass align to override. */
export function para(text: string, align?: Align): Block {
  return { type: "paragraph", runs: [{ text }], align };
}

export function centered(text: string): Block {
  return { type: "paragraph", runs: [{ text }], align: "center" };
}

export function rightAligned(text: string): Block {
  return { type: "paragraph", runs: [{ text }], align: "right" };
}

/** Thin horizontal divider, e.g. under a title. */
export function rule(): Block {
  return { type: "rule" };
}

export function signatureBlock(left: SignatureParty, right: SignatureParty): Block {
  return { type: "signatureBlock", left, right };
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

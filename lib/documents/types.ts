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
  | { type: "closing"; text: string; left: SignatureParty; right: SignatureParty };

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

/** The closing "Fait à ... le ..." line plus the signature block, as ONE
 *  unbreakable unit — a page break must never separate the closing line
 *  from the signatures that follow it (or, worse, strand the signatures
 *  alone on an otherwise-empty page). */
export function closing(text: string, left: SignatureParty, right: SignatureParty): Block {
  return { type: "closing", text, left, right };
}

export type Sex = "M" | "F" | null;

export type EmployeeDoc = {
  firstName: string;
  lastName: string;
  fullNameUpper: string; // "NOM Prénom" as used in salutations
  sex: Sex;
  dateOfBirth: string | null;
  birthPlace: string | null;
  nationality: string | null;
  address: string | null;
  socialSecurity: string | null;
  jobTitle: string | null;
  category: "chantier" | "bureau";
  hireDate: string | null;
  weeklyHours: number | null;
  classification: string | null; // groupe d'emploi A-I — drives préavis, see preavis.ts
  classe: string | null; // classification coefficient/classe, display-only
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
  representativeSex: Sex;
  conventionCollective: string;
  mutuelleProvider: string;
};

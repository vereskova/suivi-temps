/**
 * Import ponctuel des données Rentila (compte « VOLDIS ») dans les tables voldis_*.
 * Source : lecture de l'interface Rentila le 21/10/2026 (lots, locataires, baux, loyers
 * 01/11/2025 → 01/10/2026). Idempotent : upsert sur rentila_id / lot_number.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/seed-voldis-rentila.ts
 */
import { createClient } from "@supabase/supabase-js";
import { toRows, type ParsedTx } from "../lib/voldis/bank-import";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ADDRESS = "590 chemin d'Engoudes, 31450 Baziège";

const PROPERTIES = [
  { lot: "1", surface: 240, rent: 2000, status: "available" },
  { lot: "2", surface: 140, rent: 1650, status: "rented" },
  { lot: "3", surface: 140, rent: 1200, status: "rented" },
  { lot: "4", surface: 100, rent: 1080, status: "rented" },
  { lot: "5", surface: 87, rent: 0, status: "rented" },
  { lot: "6", surface: 320, rent: 5760, status: "rented" },
  { lot: "7", surface: 320, rent: 1900, status: "rented" },
  { lot: "8", surface: 30, rent: 324, status: "available" },
  { lot: "9", surface: 20, rent: 216, status: "available" },
];

type TenantSeed = { name: string; siren?: string; vat?: string; email?: string; phone?: string; address?: string; active: boolean };
const TENANTS: TenantSeed[] = [
  { name: "METOIS REMY", siren: "902472109", email: "metoisremi@gmail.com", phone: "06 49 63 28 35", active: true },
  { name: "HISTOIRE DE FACADE", siren: "891329419", email: "contact@histoiredefacade.fr", phone: "05 62 52 06 01", active: true },
  { name: "LUX MOTORS", siren: "99238659900011", email: "contact@luxmotors.fr", phone: "06 47 33 93 73", active: true },
  { name: "MIDOC JOUETS", siren: "840598213", email: "stepha1512@hotmail.fr", phone: "05 61 56 04 88", active: true },
  {
    name: "QUIROS THEO",
    siren: "838421915",
    vat: "FR79838421915",
    email: "Elgreggos@gmail.com",
    phone: "06 48 59 70 25",
    address: "39 avenue du champ de foire, 31380 Gragnague",
    active: true,
  },
  {
    name: "T2A&CO",
    siren: "928805886",
    vat: "FR35928805886",
    email: "clemendot@t-2-a.com",
    address: "Chemin d'Engoudes, 31450 Baziège",
    active: true,
  },
  { name: "VLADIS", siren: "890841844", email: "contact@vladis.fr", phone: "07 85 93 36 23", active: true },
  { name: "ISPRA INSTITUT", active: false },
  { name: "SPOOMS TRAITEUR", active: false },
];

type LeaseSeed = {
  rentilaId: string; lot: string; tenant: string; start: string; end: string;
  ht?: number; vat?: number; charges?: number; total: number; deposit: number;
};
const LEASES: LeaseSeed[] = [
  { rentilaId: "1609427", lot: "7", tenant: "LUX MOTORS", start: "2026-10-01", end: "2027-09-30", total: 3000, deposit: 0 },
  { rentilaId: "1703737", lot: "2", tenant: "QUIROS THEO", start: "2026-07-01", end: "2027-06-30", total: 1200, deposit: 0 },
  { rentilaId: "1625475", lot: "5", tenant: "T2A&CO", start: "2026-04-01", end: "2035-03-31", ht: 631.2, vat: 140, charges: 68.8, total: 840, deposit: 1400 },
  { rentilaId: "1609373", lot: "3", tenant: "HISTOIRE DE FACADE", start: "2026-01-01", end: "2029-01-01", total: 1200, deposit: 2000 },
  { rentilaId: "1609399", lot: "4", tenant: "MIDOC JOUETS", start: "2025-11-01", end: "2026-10-31", ht: 914.02, vat: 182.8, charges: 0, total: 1096.82, deposit: 2205 },
  { rentilaId: "1609431", lot: "6", tenant: "VLADIS", start: "2025-11-01", end: "2026-10-31", ht: 4608, vat: 921.6, charges: 230.4, total: 5760, deposit: 0 },
];

// id~date~type~lot~locataire~montant~tva~encaissé~état~période~reçus (export Rentila, 59 lignes)
const PAYMENTS = `80044765~01/10/2026~rent~2~QUIROS THEO~1200.00~0.00~2421.40~Payé~01/10/2026 - 31/10/2026~14/09/2026 1545.40; 01/10/2026 876.00
79988749~01/10/2026~rent~5~T2A&CO~840.00~140.00~840.00~Payé~01/10/2026 - 31/10/2026~01/10/2026
79978405~01/10/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/10/2026 - 31/10/2026~05/10/2026
79978325~01/10/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/10/2026 - 31/10/2026~01/10/2026
79978321~01/10/2026~rent~7~ISPRA INSTITUT~1900.00~316.67~0.00~En retard~01/10/2026 - 31/10/2026~
79978091~01/10/2026~rent~4~MIDOC JOUETS~1096.82~182.80~1096.82~Payé~01/10/2026 - 31/10/2026~12/10/2026
79048149~01/09/2026~rent~2~QUIROS THEO~1046.40~0.00~0.00~En retard~01/09/2026 - 30/09/2026~
78989107~01/09/2026~rent~5~T2A&CO~840.00~140.00~0.00~En retard~01/09/2026 - 30/09/2026~
78979497~01/09/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/09/2026 - 30/09/2026~01/09/2026
78979491~01/09/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/09/2026 - 30/09/2026~03/09/2026
78979349~01/09/2026~rent~4~MIDOC JOUETS~1096.82~182.80~1096.82~Payé~01/09/2026 - 30/09/2026~08/09/2026
78978965~01/09/2026~rent~7~ISPRA INSTITUT~1900.00~316.67~0.00~En retard~01/09/2026 - 30/09/2026~
78013593~01/08/2026~rent~2~QUIROS THEO~1046.40~0.00~1046.40~Payé~01/08/2026 - 31/08/2026~01/08/2026
77958741~01/08/2026~rent~5~T2A&CO~840.00~140.00~840.00~Payé~01/08/2026 - 31/08/2026~01/08/2026
77948899~01/08/2026~rent~7~ISPRA INSTITUT~1900.00~316.67~1900.00~Payé~01/08/2026 - 31/08/2026~18/08/2026
77948493~01/08/2026~rent~4~MIDOC JOUETS~1096.82~182.80~1096.82~Payé~01/08/2026 - 31/08/2026~09/08/2026
77948081~01/08/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/08/2026 - 31/08/2026~01/08/2026
77948067~01/08/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/08/2026 - 31/08/2026~03/08/2026
77452141~01/07/2026~rent~2~QUIROS THEO~1046.40~0.00~1046.40~Payé~01/07/2026 - 31/07/2026~01/07/2026
76930737~01/07/2026~rent~5~T2A&CO~840.00~140.00~840.00~Payé~01/07/2026 - 31/07/2026~01/07/2026
76923049~01/07/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/07/2026 - 31/07/2026~01/07/2026
76923045~01/07/2026~rent~7~ISPRA INSTITUT~1900.00~316.67~1900.00~Payé~01/07/2026 - 31/07/2026~20/07/2026
76923037~01/07/2026~rent~4~MIDOC JOUETS~1096.82~182.80~1096.82~Payé~01/07/2026 - 31/07/2026~09/07/2026
76923017~01/07/2026~rent~3~HISTOIRE DE FACADE~1312.00~200.00~3712.00~Payé~01/07/2026 - 31/07/2026~01/07/2026
75967483~01/06/2026~rent~5~T2A&CO~840.00~140.00~840.00~Payé~01/06/2026 - 30/06/2026~01/06/2026
75959511~01/06/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/06/2026 - 30/06/2026~01/06/2026
75959507~01/06/2026~rent~7~ISPRA INSTITUT~1900.00~316.67~1900.00~Payé~01/06/2026 - 30/06/2026~18/06/2026
75959497~01/06/2026~rent~4~MIDOC JOUETS~1096.82~182.80~1096.82~Payé~01/06/2026 - 30/06/2026~08/06/2026
75959477~01/06/2026~rent~3~HISTOIRE DE FACADE~1312.00~200.00~1312.00~Payé~01/06/2026 - 30/06/2026~01/06/2026
74821535~01/05/2026~rent~5~T2A&CO~840.00~140.00~840.00~Payé~01/05/2026 - 31/05/2026~01/05/2026
74813421~01/05/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/05/2026 - 31/05/2026~01/05/2026
74813417~01/05/2026~rent~7~ISPRA INSTITUT~1900.00~316.67~1900.00~Payé~01/05/2026 - 31/05/2026~18/05/2026
74813405~01/05/2026~rent~4~MIDOC JOUETS~1096.82~182.80~1096.82~Payé~01/05/2026 - 31/05/2026~11/05/2026
74813387~01/05/2026~rent~3~HISTOIRE DE FACADE~1312.00~200.00~1312.00~Payé~01/05/2026 - 31/05/2026~01/05/2026
73769461~20/04/2026~rent~7~ISPRA INSTITUT~1900.00~0.00~1900.00~Payé~01/04/2026 - 30/04/2026~20/04/2026
73769431~07/04/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/04/2026 - 30/04/2026~07/04/2026
73769451~02/04/2026~rent~4~MIDOC JOUETS~1096.82~0.00~1096.82~Payé~01/04/2026 - 30/04/2026~02/04/2026
73844229~01/04/2026~rent~5~T2A&CO~840.00~140.00~840.00~Payé~01/04/2026 - 30/04/2026~01/04/2026
73844225~01/04/2026~income~5~T2A&CO~1400.00~0.00~1400.00~Payé~~01/04/2026
73769465~01/04/2026~rent~6~VLADIS~5760.00~921.60~5760.00~Payé~01/04/2026 - 30/04/2026~29/04/2026
72995911~01/03/2026~rent~6~VLADIS~6856.00~1100.00~12616.00~Payé~01/03/2026 - 31/03/2026~01/03/2026
72995881~01/03/2026~rent~7~ISPRA INSTITUT~1900.00~0.00~5056.00~Payé~01/03/2026 - 31/03/2026~01/03/2026
72995297~01/03/2026~rent~4~MIDOC JOUETS~1280.00~200.00~1280.00~Payé~01/03/2026 - 31/03/2026~01/03/2026
72994809~01/03/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/03/2026 - 31/03/2026~03/02/2026
72995909~01/02/2026~rent~6~VLADIS~6856.00~1100.00~6856.00~Payé~01/02/2026 - 28/02/2026~01/02/2026
72995879~01/02/2026~rent~7~ISPRA INSTITUT~1900.00~0.00~1900.00~Payé~01/02/2026 - 28/02/2026~01/02/2026
72995295~01/02/2026~rent~4~MIDOC JOUETS~1280.00~200.00~1280.00~Payé~01/02/2026 - 28/02/2026~01/02/2026
72994807~01/02/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/02/2026 - 28/02/2026~01/02/2026
71095147~21/01/2026~rent~2~SPOOMS TRAITEUR~1661.62~276.94~1661.62~Payé~~21/01/2026
72995907~01/01/2026~rent~6~VLADIS~6856.00~1100.00~6856.00~Payé~01/01/2026 - 31/01/2026~01/01/2026
72995877~01/01/2026~rent~7~ISPRA INSTITUT~1956.00~0.00~1956.00~Payé~01/01/2026 - 31/01/2026~01/01/2026
72995293~01/01/2026~rent~4~MIDOC JOUETS~1280.00~200.00~1280.00~Payé~01/01/2026 - 31/01/2026~01/01/2026
72994805~01/01/2026~rent~3~HISTOIRE DE FACADE~1200.00~0.00~1200.00~Payé~01/01/2026 - 31/01/2026~01/01/2026
72995905~01/12/2025~rent~6~VLADIS~6856.00~1100.00~6856.00~Payé~01/12/2025 - 31/12/2025~01/12/2025
72995875~01/12/2025~rent~7~ISPRA INSTITUT~1900.00~0.00~1900.00~Payé~01/12/2025 - 31/12/2025~01/12/2025
72995291~01/12/2025~rent~4~MIDOC JOUETS~1280.00~200.00~1280.00~Payé~01/12/2025 - 31/12/2025~01/12/2025
72995903~01/11/2025~rent~6~VLADIS~6856.00~1100.00~6856.00~Payé~01/11/2025 - 30/11/2025~01/11/2025
72995873~01/11/2025~rent~7~ISPRA INSTITUT~1956.00~0.00~1956.00~Payé~01/11/2025 - 30/11/2025~01/11/2025
72995289~01/11/2025~rent~4~MIDOC JOUETS~1280.00~200.00~1280.00~Payé~01/11/2025 - 30/11/2025~01/11/2025`;

// Opérations du compte « COMPTE COURANT S.C.I. VOLDIS » (Crédit Agricole) importées dans Rentila : 73 lignes.
// date~montant signé~libellé. Totaux de contrôle Rentila : revenus 90 539,52 €, dépenses −54 267,99 €.
const BANK = `2026-10-19~1545.40~VIREMENT EN VOTRE FAVEUR VIR INST de IL MERCATO TOULOUSE VIREMENT INSTANTANE VIREMENT VERS VOLDIS
2026-10-12~-3.10~PRELEVEMENT Tenue de compte professionnel Facture N°2628500336301
2026-10-12~1096.82~VIREMENT EN VOTRE FAVEUR Loyer S.A.R.L. MIDOC JOUETS Loyer
2026-10-09~-3351.73~VIREMENT EMIS VIR INST vers ALLIANCE AUTO INDU No 2026/1000757 client 90001
2026-10-06~-4495.92~VIREMENT EMIS VIR INST vers wurth achat, materiel N de devis 143076001
2026-10-05~-2456.15~REMBOURSEMENT DE PRET 00002566685 05/10/26 CAPITAL
2026-10-05~-1723.01~REMBOURSEMENT DE PRET 00002566685 05/10/26 INTERETS
2026-10-05~-140.45~PRELEVEMENT AXA FRANCE IARD SA I0000995443191-CONTRAT0000022465501904 I0000995443191 00AX000000000024966620 FR14ZZZ391832
2026-10-05~1200.00~VIREMENT EN VOTRE FAVEUR VIR INST de HISTOIRE DE FACADE Loyer
2026-10-02~-87.98~REGLEMENT ASSU. CAAE PRET PROFESSION.10/26
2026-10-01~3000.00~VIREMENT EN VOTRE FAVEUR VIR INST de LUX MOTORS Envoye depuis Qonto SCTINSTOUTQr9egKP1Q,ybVkIjtI608A
2026-10-01~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUTwgijqb+ZS1K1RqE2a0qZfA
2026-10-01~876.00~VIREMENT EN VOTRE FAVEUR DE S.A.R.L. T2A ? CO LOYER DEPOT
2026-09-28~-18095.00~PRELEVEMENT DIRECTION GENERALE DES FINANCES 600234592216TLR2631404081965 TLRSEPA DGFIP IMPOT TF 2P0670000TLR263140408196531028 NNFR46ZZZ0050022631404081965R592216 FR46ZZZ005002
2026-09-21~-31.20~PRELEVEMENT FITECO PRV-01906979-5650360069 20773322012026 FR58FRA006047
2026-09-14~1545.40~VIREMENT EN VOTRE FAVEUR VIR INST de QUIROS THEO (EI) VIR DE QUIROS THEO (EI) VU6257321SBEYD01
2026-09-10~-3.10~PRELEVEMENT Tenue de compte professionnel Facture N°2625300248553
2026-09-08~1096.82~VIREMENT EN VOTRE FAVEUR Loyer S.A.R.L. MIDOC JOUETS Loyer
2026-09-07~4380.00~VIREMENT EN VOTRE FAVEUR LOYER DEPOT AVRIL - AOUT S.A.R.L LOYER DEPOT AVRIL - AOUT
2026-09-07~1400.00~VIREMENT EN VOTRE FAVEUR DEPOT DE GARANTI DEPOT S.A.R.L. DEPOT DE GARANTI DEPOT
2026-09-07~-140.45~PRELEVEMENT AXA FRANCE IARD SA I0000987090604-CONTRAT0000022465501904 I0000987090604 00AX000000000024966620 FR14ZZZ391832
2026-09-05~-2448.44~REMBOURSEMENT DE PRET 00002566685 05/09/26 CAPITAL
2026-09-05~-1730.72~REMBOURSEMENT DE PRET 00002566685 05/09/26 INTERETS
2026-09-03~1200.00~VIREMENT EN VOTRE FAVEUR VIR INST de HISTOIRE DE FACADE Loyer
2026-09-02~-87.98~REGLEMENT ASSU. CAAE PRET PROFESSION.09/26
2026-09-01~2600.00~VIREMENT EN VOTRE FAVEUR VIR INST de LUX MOTORS Envoye depuis Qonto SCTINSTOUTnm3NzoL7ROKV3hEiwoMBjw
2026-09-01~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUToGREY3iuQyG9UaL1bX17iA
2026-08-20~-1470.00~PRELEVEMENT FITECO PRV-01864365-5650004396 20773322012026 FR58FRA006047
2026-08-18~1900.00~VIREMENT EN VOTRE FAVEUR ISPRA INSTITUT I27V26230L000295 LOC ENGOUDES ISPRA I27V26230L000295
2026-08-10~1545.40~VIREMENT EN VOTRE FAVEUR VIR INST de QUIROS THEO (EI) VIR DE QUIROS THEO (EI) VU622224XHWF0U01
2026-08-10~-3.10~PRELEVEMENT Tenue de compte professionnel Facture N°2622200242870
2026-08-09~1096.82~VIREMENT EN VOTRE FAVEUR Loyer S.A.R.L. MIDOC JOUETS Loyer
2026-08-05~-140.45~PRELEVEMENT AXA FRANCE IARD SA I0000979008715-CONTRAT0000022465501904 I0000979008715 00AX000000000024966620 FR14ZZZ391832
2026-08-05~-2440.75~REMBOURSEMENT DE PRET 00002566685 05/08/26 CAPITAL
2026-08-05~-1738.41~REMBOURSEMENT DE PRET 00002566685 05/08/26 INTERETS
2026-08-04~-87.98~REGLEMENT ASSU. CAAE PRET PROFESSION.08/26
2026-08-03~1200.00~VIREMENT EN VOTRE FAVEUR VIR INST de HISTOIRE DE FACADE Loyer
2026-08-01~2600.00~VIREMENT EN VOTRE FAVEUR VIR INST de LUX MOTORS Envoye depuis Qonto SCTINSTOUTGZUgTs2QSSOMS6,xZp1pbA
2026-08-01~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUTMUY25CSKRJW7mVm8PyNUnw
2026-07-24~-360.00~PRELEVEMENT FITECO PRV-01861927-5649936798 20773322012026 FR58FRA006047
2026-07-20~1900.00~VIREMENT EN VOTRE FAVEUR ISPRA INSTITUT I27V26199L000292 LOC ENGOUDES ISPRA I27V26199L000292
2026-07-10~-3.10~PRELEVEMENT Tenue de compte professionnel Facture N°2619100195417
2026-07-09~1096.82~VIREMENT EN VOTRE FAVEUR Loyer depot S.A.R.L. MIDOC JOUET Loyer depot
2026-07-07~1046.40~VIREMENT EN VOTRE FAVEUR VIR INST de QUIROS THEO (EI) VIR DE QUIROS THEO (EI) VU618834M6FKL101
2026-07-06~-140.45~PRELEVEMENT AXA FRANCE IARD SA I0000970731874-CONTRAT0000022465501904 I0000970731874 00AX000000000024966620 FR14ZZZ391832
2026-07-05~-2433.09~REMBOURSEMENT DE PRET 00002566685 05/07/26 CAPITAL
2026-07-05~-1746.07~REMBOURSEMENT DE PRET 00002566685 05/07/26 INTERETS
2026-07-02~-87.98~REGLEMENT ASSU. CAAE PRET PROFESSION.07/26
2026-07-02~1200.00~VIREMENT EN VOTRE FAVEUR VIR INST de HISTOIRE DE FACADE Loyer
2026-07-01~2600.00~VIREMENT EN VOTRE FAVEUR VIR INST de LUX MOTORS Envoye depuis Qonto SCTINSTOUTx8Shg4myTZmBlDOwB4i4,Q
2026-07-01~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUTvZVhmbbgTda48cVkxWLdQw
2026-06-18~1900.00~VIREMENT EN VOTRE FAVEUR ISPRA INSTITUT I27V26169L000294 LOC ENGOUDES ISPRA I27V26169L000294
2026-06-10~-3.10~PRELEVEMENT Tenue de compte professionnel
2026-06-08~1096.82~VIREMENT EN VOTRE FAVEUR loyer depot S.A.R.L. MIDOC JOUET loyer depot
2026-06-05~-2425.45~REMBOURSEMENT DE PRET 00002566685 05/06/26 CAPITAL
2026-06-05~-1753.71~REMBOURSEMENT DE PRET 00002566685 05/06/26 INTERETS
2026-06-05~-140.45~PRELEVEMENT AXA FRANCE IARD SA I0000962737336-CONTRAT0000022465501904 I0000962737336 00AX000000000024966620 FR14ZZZ391832
2026-06-04~1200.00~VIREMENT EN VOTRE FAVEUR VIR INST de HISTOIRE DE FACADE Loyer
2026-06-02~1200.00~VIREMENT EN VOTRE FAVEUR VIR INST de HISTOIRE DE FACADE Loyer
2026-06-02~2600.00~VIREMENT EN VOTRE FAVEUR LUX MOTORS RAWSCTOUTqVcPCrmlTmqA Envoye depuis Qonto RAWSCTOUTqVcPCrmlTmqAdC+nPHweng
2026-06-02~-87.98~REGLEMENT ASSU. CAAE PRET PROFESSION.06/26
2026-06-01~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUTzjhkFs,HQqycnT9+zS+kLw
2026-05-18~1900.00~VIREMENT EN VOTRE FAVEUR ISPRA INSTITUT I27V26138L000567 LOC ENGOUDES ISPRA I27V26138L000567
2026-05-11~-3.10~PRELEVEMENT Tenue de compte professionnel
2026-05-11~1096.82~VIREMENT EN VOTRE FAVEUR Loyer depot S.A.R.L. MIDOC JOUET Loyer depot
2026-05-05~-87.98~REGLEMENT ASSU. CAAE PRET PROFESSION.05/26
2026-05-05~-140.45~PRELEVEMENT AXA FRANCE IARD SA I0000954725852-CONTRAT0000022465501904 I0000954725852 00AX000000000024966620 FR14ZZZ391832
2026-05-05~-2417.83~REMBOURSEMENT DE PRET 00002566685 05/05/26 CAPITAL
2026-05-05~-1761.33~REMBOURSEMENT DE PRET 00002566685 05/05/26 INTERETS
2026-05-01~2600.00~VIREMENT EN VOTRE FAVEUR VIR INST de LUX MOTORS Envoye depuis Qonto SCTINSTOUT5nZmszLpSM6d2wpkiBH52Q
2026-05-01~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUTBthHbNN,Rc+BFWBjHjzSZQ
2026-04-30~500.00~VIREMENT EN VOTRE FAVEUR VIR INST de QUIROS THEO (EI) VIR DE QUIROS THEO (EI) VU61203986LBKX01
2026-04-29~5760.00~VIREMENT EN VOTRE FAVEUR VIR INST de VLADIS location local SCTINSTOUTelIswQZ0SNuxLCOuYhPRZQ`;
const BANK_IBAN = "FR7613106005003004930459176";
const BANK_ACCOUNT = "COMPTE COURANT S.C.I. VOLDIS";

const iso = (fr: string) => {
  const [d, m, y] = fr.trim().split("/");
  return `${y}-${m}-${d}`;
};
const STATUS: Record<string, string> = { "Payé": "paid", "En retard": "late", "Non payé": "unpaid", "Partiel": "partial", "Perdu": "lost" };

async function main() {
  const { data: props, error: pe } = await supabase
    .from("voldis_properties")
    .upsert(
      PROPERTIES.map((p) => ({
        lot_number: p.lot,
        label: `Box ${p.lot}`,
        address: ADDRESS,
        surface_m2: p.surface,
        list_rent: p.rent,
        status: p.status,
      })),
      { onConflict: "lot_number" }
    )
    .select("id, lot_number");
  if (pe) throw pe;
  const propByLot = new Map((props ?? []).map((p) => [p.lot_number, p.id as string]));

  const { data: existing } = await supabase.from("voldis_tenants").select("id, name");
  const tenantByName = new Map((existing ?? []).map((t) => [t.name, t.id as string]));
  for (const t of TENANTS) {
    const row = {
      name: t.name,
      siren: t.siren ?? null,
      vat_number: t.vat ?? null,
      email: t.email ?? null,
      phone: t.phone ?? null,
      address: t.address ?? null,
      is_active: t.active,
    };
    const known = tenantByName.get(t.name);
    if (known) {
      const { error } = await supabase.from("voldis_tenants").update(row).eq("id", known);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("voldis_tenants").insert(row).select("id").single();
      if (error) throw error;
      tenantByName.set(t.name, data.id);
    }
  }

  const leaseIdByKey = new Map<string, string>(); // lot|tenant
  for (const l of LEASES) {
    const { data, error } = await supabase
      .from("voldis_leases")
      .upsert(
        {
          rentila_id: l.rentilaId,
          property_id: propByLot.get(l.lot),
          tenant_id: tenantByName.get(l.tenant),
          start_date: l.start,
          end_date: l.end,
          rent_ht: l.ht ?? null,
          vat: l.vat ?? null,
          charges: l.charges ?? null,
          monthly_total: l.total,
          deposit: l.deposit,
          is_active: true,
        },
        { onConflict: "rentila_id" }
      )
      .select("id")
      .single();
    if (error) throw error;
    leaseIdByKey.set(`${l.lot}|${l.tenant}`, data.id);
  }

  const rows = PAYMENTS.split("\n").map((line) => {
    const [id, date, type, lot, tenant, due, vat, paid, status, period, received] = line.split("~");
    const [ps, pe2] = period ? period.split(" - ") : [null, null];
    const lastReceived = received ? received.split(";").pop()!.trim().split(" ")[0] : "";
    return {
      rentila_id: id,
      kind: type === "rent" ? "rent" : "deposit",
      due_date: iso(date),
      period_start: ps ? iso(ps) : null,
      period_end: pe2 ? iso(pe2) : null,
      amount_due: Number(due),
      vat_amount: Number(vat),
      amount_paid: Number(paid),
      paid_on: lastReceived ? iso(lastReceived) : null,
      status: STATUS[status] ?? "unpaid",
      description: type === "rent" ? (period ? `Loyer ${period}` : "Loyer") : "Dépôt de garantie",
      property_id: propByLot.get(lot) ?? null,
      tenant_id: tenantByName.get(tenant) ?? null,
      lease_id: leaseIdByKey.get(`${lot}|${tenant}`) ?? null,
    };
  });
  const { error: ce } = await supabase.from("voldis_charges").upsert(rows, { onConflict: "rentila_id" });
  if (ce) throw ce;

  const parsed: ParsedTx[] = BANK.split("\n").map((l) => {
    const [date, amount, ...label] = l.split("~");
    return { date, amount: Number(amount), label: label.join("~") };
  });
  const bankRows = toRows(parsed, "rentila").map((r) => ({ ...r, bank_account: BANK_ACCOUNT, iban: BANK_IBAN }));
  const { error: be } = await supabase.from("voldis_bank_transactions").upsert(bankRows, { onConflict: "external_id" });
  if (be) throw be;

  console.log(`OK : ${bankRows.length} opérations bancaires, ${PROPERTIES.length} lots, ${TENANTS.length} locataires, ${LEASES.length} baux, ${rows.length} échéances`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

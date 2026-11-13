// Каталог вкладок админки для экрана « Настройки » (ключи = ViewKey в app/admin/page.tsx).
// Держать в синхроне с NAV_GROUPS. Роль определяет, что разрешено в базе (RLS); этот список
// только СУЖАЕТ меню и переводит вкладку в режим просмотра.

export type TabDef = { key: string; label: string; labelRu: string; group: string };

export const TAB_CATALOG: TabDef[] = [
  { key: "echeances", label: "Notifications", labelRu: "Уведомления", group: "Общее" },
  { key: "jour", label: "Par jour", labelRu: "По дням", group: "Pointage" },
  { key: "employe", label: "Par employé", labelRu: "По сотруднику", group: "Pointage" },
  { key: "mois", label: "Totaux du mois", labelRu: "Итоги за месяц", group: "Pointage" },
  { key: "hebdo", label: "Recalcul hebdo", labelRu: "Пересчёт по неделям", group: "Pointage" },
  { key: "export", label: "Export / Import", labelRu: "Экспорт / Импорт", group: "Pointage" },
  { key: "effectif", label: "Employés", labelRu: "Сотрудники", group: "Effectif" },
  { key: "phones", label: "Téléphones pro", labelRu: "Рабочие телефоны", group: "Effectif" },
  { key: "medical", label: "Médical", labelRu: "Медицина", group: "Effectif" },
  { key: "planning", label: "Planning chantiers", labelRu: "План по объектам", group: "Effectif" },
  { key: "formations", label: "Formations", labelRu: "Обучение", group: "Effectif" },
  { key: "tailles", label: "Tailles", labelRu: "Размеры", group: "Effectif" },
  { key: "dashboards", label: "HR-дашборды", labelRu: "HR-дашборды", group: "Dashboards" },
  { key: "calculators", label: "Calculateurs", labelRu: "Калькуляторы", group: "Calculateurs" },
  { key: "documents", label: "Documents", labelRu: "Документы", group: "RH" },
  { key: "registre", label: "Registre du personnel", labelRu: "Реестр персонала", group: "RH" },
  { key: "organigramme", label: "Organigramme", labelRu: "Оргструктура", group: "RH" },
  { key: "schema", label: "Schéma de l'entreprise", labelRu: "Схема компании", group: "RH" },
  { key: "francais", label: "Cours de français", labelRu: "Курсы французского", group: "RH" },
  { key: "dossier", label: "Dossier salarié", labelRu: "Личное дело", group: "RH" },
  { key: "checklists", label: "Checklists RH", labelRu: "Чек-листы", group: "RH" },
  { key: "paie", label: "Paie", labelRu: "Зарплата", group: "RH" },
  { key: "paie_extras", label: "Primes & Bonus", labelRu: "Премии и бонусы", group: "RH" },
  { key: "controle_journal", label: "Pénalités contrôle", labelRu: "Штрафы контролёра", group: "RH" },
  { key: "penalty_catalog", label: "Barème des pénalités", labelRu: "Справочник штрафов", group: "RH" },
  { key: "audit", label: "Journal d'audit", labelRu: "Журнал аудита", group: "RH" },
  { key: "commercial", label: "Commercial", labelRu: "Коммерция", group: "Commercial" },
  { key: "objects", label: "Chantiers", labelRu: "Объекты и контрандю", group: "Commercial" },
  { key: "files", label: "Dossiers chantiers", labelRu: "Папки объектов", group: "Commercial" },
  { key: "autoparc", label: "Autoparc", labelRu: "Автопарк", group: "Autoparc" },
];

export type TabMode = "view" | "edit";
export type TabsConfig = Record<string, TabMode>;

/** Роли, которые можно выдавать из « Настроек » (+ что они значат). */
export const ASSIGNABLE_ROLES: { role: string; label: string; hint: string }[] = [
  { role: "rh_admin", label: "RH Admin", hint: "Полный доступ ко всему, включая Настройки." },
  { role: "rh", label: "RH", hint: "Сотрудники и RH-разделы; без Paie, Commercial, Autoparc, аудита. Primes & Bonus - только чтение." },
  { role: "comptable", label: "Comptable", hint: "Paie и Primes & Bonus (полный доступ) + просмотр сотрудников." },
  { role: "rh_readonly", label: "Employés + Primes", hint: "Сотрудники (без конфиденциальных данных: зарплата, соцстрахование…), Primes & Bonus, справочник штрафов, оргсхема, телефоны - с редактированием." },
  { role: "commercial", label: "Commercial", hint: "Только раздел Commercial." },
  { role: "commercial_rh", label: "Commercial + Employés", hint: "Commercial и просмотр сотрудников." },
  { role: "controleur", label: "Контролёр", hint: "Только экран /controle: внесение штрафов по объектам." },
  { role: "brigadir", label: "Бригадир", hint: "Только кабинет /brigadir: объекты и контрандю своей команды (команда - по привязанному сотруднику), отметки, премии." },
];

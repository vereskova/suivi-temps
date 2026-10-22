import type { Metadata } from "next";

// Страницы бригад - для русскоязычных сотрудников: язык ru и запрет автоперевода браузера
// (Chrome иначе считает сайт французским и портит русский текст машинным «переводом»).
export const metadata: Metadata = {
  other: { google: "notranslate" },
};

export default function EquipeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="ru" translate="no" className="notranslate">
      {children}
    </div>
  );
}

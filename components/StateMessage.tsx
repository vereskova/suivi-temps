import { Inbox, AlertCircle, type LucideIcon } from "lucide-react";

function StateMessage({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone: "neutral" | "error";
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          tone === "error" ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-400"
        }`}
      >
        <Icon size={20} />
      </div>
      <p className="font-bold text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-400 max-w-sm">{description}</p>}
    </div>
  );
}

export function EmptyState({ title = "Aucun résultat", description }: { title?: string; description?: string }) {
  return <StateMessage icon={Inbox} title={title} description={description} tone="neutral" />;
}

export function ErrorState({ title = "Une erreur est survenue", description }: { title?: string; description?: string }) {
  return <StateMessage icon={AlertCircle} title={title} description={description} tone="error" />;
}

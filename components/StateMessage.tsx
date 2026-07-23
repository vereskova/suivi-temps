import { Inbox, AlertCircle, type LucideIcon } from "lucide-react";

function StateMessage({
  icon: Icon,
  title,
  titleRu,
  description,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  titleRu?: string;
  description?: string;
  tone: "neutral" | "error";
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          tone === "error" ? "bg-error-50 text-error-500" : "bg-stone-100 text-stone-400"
        }`}
      >
        <Icon size={20} />
      </div>
      <p className="font-bold text-stone-700">
        {title}
        {titleRu && (
          <span className="block text-xs font-medium text-stone-400 opacity-70 mt-0.5">
            {titleRu}
          </span>
        )}
      </p>
      {description && <p className="text-sm text-stone-400 max-w-sm">{description}</p>}
    </div>
  );
}

export function EmptyState({
  title = "Aucun résultat",
  titleRu,
  description,
}: {
  title?: string;
  titleRu?: string;
  description?: string;
}) {
  return (
    <StateMessage icon={Inbox} title={title} titleRu={titleRu} description={description} tone="neutral" />
  );
}

export function ErrorState({
  title = "Une erreur est survenue",
  titleRu,
  description,
}: {
  title?: string;
  titleRu?: string;
  description?: string;
}) {
  return (
    <StateMessage icon={AlertCircle} title={title} titleRu={titleRu} description={description} tone="error" />
  );
}

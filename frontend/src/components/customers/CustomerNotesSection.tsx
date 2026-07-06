import { useTranslation } from "react-i18next";
import { StickyNote } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { useNotes } from "../../hooks/useNotes";
import { useSetView } from "../../context/ViewContext";

interface Props {
  customerName: string;
}

/** Notes belonging to a customer, shown on the customer
 * card. Clicking opens the note in the Notes view (search
 * by title, which resolves cleanly). */
export function CustomerNotesSection({ customerName }: Props) {
  const { t } = useTranslation("customers");
  const { data: notes = [] } = useNotes();
  const setView = useSetView();

  const mine = notes.filter(
    (n) =>
      (n.customer || "").toLowerCase()
      === customerName.toLowerCase(),
  );

  return (
    <CollapsibleSection label={t("notes")} count={mine.length}>
      <div className="ml-5">
        {mine.length === 0 ? (
          <p className="text-2xs text-fg-muted py-1">
            {t("noNotes")}
          </p>
        ) : (
          mine.map((n) => (
            <button
              key={n.id}
              onClick={() => setView("notes", n.title)}
              className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-surface-overlay/40"
            >
              <StickyNote
                size={12}
                className="text-fg-subtle shrink-0"
              />
              <span className="flex-1 text-xs truncate">
                {n.title}
              </span>
            </button>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}

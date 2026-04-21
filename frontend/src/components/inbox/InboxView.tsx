import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInboxItems } from "../../hooks/useInbox";
import { AddInboxForm } from "./AddInboxForm";
import { InboxItemRow } from "./InboxItemRow";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { SearchInput } from "../common/SearchInput";
import { DOCS } from "../../docs/panelDocs";
import { matchesAny } from "../../utils/filterMatch";
import { registerPanelAction } from "../../utils/panelActions";

export function InboxView() {
  const { t } = useTranslation("inbox");
  const { t: tc } = useTranslation("common");
  const { data: items = [], isLoading } = useInboxItems();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(
    () => registerPanelAction("inbox", () => setShowForm(true)),
    [],
  );

  const matchesSearch = (title: string) =>
    matchesAny([title], search);

  const active = items.filter(
    (i) =>
      i.properties?.ARCHIVED !== "true" && matchesSearch(i.title ?? "")
  );
  const archived = items.filter(
    (i) =>
      i.properties?.ARCHIVED === "true" && matchesSearch(i.title ?? "")
  );

  return (
    <div className="flex flex-col h-full">
      <PanelToolbar
        left={<>
          <SearchInput
            value={search}
            onChange={setSearch}
            validate
            inputClassName={[
              "px-2 py-1 rounded-lg text-xs",
              "bg-surface-raised border border-border",
              "text-stone-900 placeholder-stone-500",
              "focus:outline-none focus:border-cta",
              "w-40 pr-6",
            ].join(" ")}
            className="w-40"
          />
        </>}
        right={<>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={[
              "px-3 py-1 rounded-lg text-xs bg-cta",
              "text-white hover:bg-cta-hover transition-colors",
            ].join(" ")}
          >
            {t("addItem")}
          </button>
          <HelpButton title="Inbox" doc={DOCS.inbox} view="inbox" />
        </>}
      />
      {showForm && <AddInboxForm onClose={() => setShowForm(false)} />}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-stone-500 text-center py-8">
            {tc("loading")}
          </p>
        )}
        {!isLoading && active.length === 0 && archived.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-stone-500 text-sm">{t("inboxEmpty")}</p>
            <p className="text-stone-400 text-xs">
              {t("inboxEmptyHint")}
            </p>
          </div>
        )}
        {active.map((item) => (
          <InboxItemRow key={item.id} item={item} />
        ))}

        {/* Archive drawer */}
        {archived.length > 0 && (
          <div className="border-t border-border-subtle mt-2">
            <CollapsibleSection
              label={tc("archive")}
              count={archived.length}
              className="px-4 py-2"
            >
              {archived.map((item) => (
                <div key={item.id} className="opacity-60">
                  <InboxItemRow item={item} />
                </div>
              ))}
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useInboxItems } from "../../hooks/useInbox";
import { reorderInboxItems } from "../../api/client";
import { AddInboxForm } from "./AddInboxForm";
import { InboxItemRow } from "./InboxItemRow";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { SearchInput } from "../common/SearchInput";
import { DOCS } from "../../docs/panelDocs";
import { matchesAny } from "../../utils/filterMatch";
import {
  registerPanelAction,
} from "../../utils/panelActions";

function SortableInboxRow({
  item,
}: {
  item: import("../../types").InboxItem;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="border-b border-border-subtle"
    >
      <div className="flex items-center px-4 py-1">
        <button
          {...attributes}
          {...listeners}
          className={[
            "cursor-grab shrink-0 mr-2",
            "text-stone-300 hover:text-stone-500",
            "touch-none",
          ].join(" ")}
        >
          <GripVertical size={12} />
        </button>
        <div className="flex-1 min-w-0">
          <InboxItemRow item={item} />
        </div>
      </div>
    </div>
  );
}

export function InboxView() {
  const { t } = useTranslation("inbox");
  const { t: tc } = useTranslation("common");
  const qc = useQueryClient();
  const {
    data: items = [], isLoading,
  } = useInboxItems();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  useEffect(
    () => registerPanelAction(
      "inbox", () => setShowForm(true),
    ),
    [],
  );

  const matchesSearch = (title: string) =>
    matchesAny([title], search);

  const active = items.filter(
    (i) =>
      i.properties?.ARCHIVED !== "true"
      && matchesSearch(i.title ?? ""),
  );
  const archived = items.filter(
    (i) =>
      i.properties?.ARCHIVED === "true"
      && matchesSearch(i.title ?? ""),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active: a, over } = event;
    if (!over || a.id === over.id) return;
    const oldIdx = active.findIndex(
      (i) => i.id === String(a.id),
    );
    const newIdx = active.findIndex(
      (i) => i.id === String(over.id),
    );
    if (oldIdx < 0 || newIdx < 0) return;

    // Optimistic: reorder in cache immediately
    const moved = [...items];
    const [item] = moved.splice(oldIdx, 1);
    moved.splice(newIdx, 0, item);
    qc.setQueryData(["inbox"], moved);

    // Persist to backend
    const ids = moved
      .filter(
        (i) =>
          i.properties?.ARCHIVED !== "true",
      )
      .map((i) => i.id);
    reorderInboxItems(ids).then(() => {
      void qc.invalidateQueries({
        queryKey: ["inbox"],
      });
    });
  }

  return (
    <div className="flex flex-col h-full">
      <PanelToolbar
        left={<>
          <SearchInput
            value={search}
            onChange={setSearch}
            validate
            className="w-40"
          />
        </>}
        right={<>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={[
              "px-3 py-1 rounded-lg text-xs bg-cta",
              "text-white hover:bg-cta-hover",
              "transition-colors",
            ].join(" ")}
          >
            {t("addItem")}
          </button>
          <HelpButton
            title="Inbox"
            doc={DOCS.inbox}
            view="inbox"
          />
        </>}
      />
      {showForm && (
        <AddInboxForm
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-stone-500 text-center py-8">
            {tc("loading")}
          </p>
        )}
        {!isLoading
          && active.length === 0
          && archived.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-stone-500 text-sm">
              {t("inboxEmpty")}
            </p>
            <p className="text-stone-400 text-xs">
              {t("inboxEmptyHint")}
            </p>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={active.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {active.map((item) => (
              <SortableInboxRow
                key={item.id}
                item={item}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Archive drawer */}
        {archived.length > 0 && (
          <div className="border-t border-border-subtle mt-2">
            <CollapsibleSection
              label={tc("archive")}
              count={archived.length}
              className="px-4 py-2"
            >
              {archived.map((item) => (
                <div
                  key={item.id}
                  className="opacity-60"
                >
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

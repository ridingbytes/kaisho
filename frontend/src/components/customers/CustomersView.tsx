import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateCustomer, useCustomers } from "../../hooks/useCustomers";
import { useSettings } from "../../hooks/useSettings";
import { matchesAny } from "../../utils/filterMatch";
import { registerPanelAction } from "../../utils/panelActions";
import { Toggle } from "../common/Toggle";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { SearchInput } from "../common/SearchInput";
import { DOCS } from "../../docs/panelDocs";
import { smallInputCls } from "../../styles/formStyles";
import { CustomerCard } from "./CustomerCard";
import { usePendingSearch } from "../../context/ViewContext";
import type { Customer } from "../../types";

const inputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-sm " +
  "text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta";

function AddCustomerForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("customers");
  const { t: tc } = useTranslation("common");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [budgetVal, setBudgetVal] = useState("");
  const [repo, setRepo] = useState("");
  const create = useCreateCustomer();
  const { data: settings } = useSettings();
  const customerTypes = settings?.customer_types ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        type: type || undefined,
        budget: budgetVal ? parseFloat(budgetVal) : 0,
        repo: repo.trim() || null,
      },
      { onSuccess: onClose }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 px-6 py-3 border-b border-border-subtle bg-surface-card/60"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {tc("name")} *
        </label>
        <input
          className={inputCls}
          placeholder={t("customerName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      {customerTypes.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-stone-600 uppercase tracking-wider">
            {tc("type")}
          </label>
          <select
            className={`${inputCls} w-32`}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{tc("noNone")}</option>
            {customerTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {t("budgetH")}
        </label>
        <input
          className={`${inputCls} w-24`}
          placeholder="0"
          type="number"
          min="0"
          step="0.5"
          value={budgetVal}
          onChange={(e) => setBudgetVal(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {t("githubRepo")}
        </label>
        <input
          className={`${inputCls} w-40`}
          placeholder={t("ownerRepo")}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="px-3 py-1.5 rounded bg-cta text-white text-xs font-semibold disabled:opacity-40"
        >
          {create.isPending ? tc("adding") : tc("add")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-surface-raised text-stone-700 text-xs"
        >
          {tc("cancel")}
        </button>
      </div>
      {create.isError && (
        <p className="w-full text-xs text-red-400">
          {(create.error as Error).message}
        </p>
      )}
    </form>
  );
}

type SortKey = "budget" | "name";

function sortAndFilter(
  customers: Customer[],
  search: string,
  sortBy: SortKey
) {
  const filtered = search
    ? customers.filter((c) => matchesAny([c.name], search))
    : customers;
  return [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return (b.budget ?? 0) - (a.budget ?? 0);
  });
}

export function CustomersView() {
  const { t } = useTranslation("customers");
  const { t: tc } = useTranslation("common");
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("budget");
  const { data: customers = [], isLoading } = useCustomers(showInactive);
  const { pendingSearch, clearPendingSearch } = usePendingSearch();

  useEffect(
    () => registerPanelAction("customers", () => setAdding(true)),
    []
  );

  useEffect(() => {
    if (pendingSearch) {
      setSearch(pendingSearch);
      clearPendingSearch();
    }
  }, [pendingSearch, clearPendingSearch]);

  const visible = sortAndFilter(customers, search, sortBy);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <PanelToolbar
        left={<>
          <SearchInput
            value={search}
            onChange={setSearch}
            validate
            className="w-44"
          />
          <select
            className={`${smallInputCls} !w-32`}
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as SortKey)
            }
          >
            <option value="budget">{t("sortBudget")}</option>
            <option value="name">{t("sortName")}</option>
          </select>
        </>}
        right={<>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-stone-600">
              {t("showInactive")}
            </span>
            <Toggle
              checked={showInactive}
              onChange={setShowInactive}
            />
          </label>
          <button
            onClick={() => setAdding((v) => !v)}
            className={[
              "px-2.5 py-1 rounded bg-cta-muted",
              "text-cta text-xs font-semibold",
              "hover:bg-cta hover:text-white transition-colors",
            ].join(" ")}
          >
            {t("addCustomer")}
          </button>
          <HelpButton
            title="Customers"
            doc={DOCS.customers}
            view="customers"
          />
        </>}
      />

      {/* Add form */}
      {adding && <AddCustomerForm onClose={() => setAdding(false)} />}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && (
          <p className="text-sm text-stone-500 text-center py-8">
            {tc("loading")}
          </p>
        )}
        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-stone-500 text-center py-8">
            {t("noCustomersFound")}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((c) => (
            <CustomerCard key={c.name} customer={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

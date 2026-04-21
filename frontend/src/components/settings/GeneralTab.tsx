import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Check, Copy, Pencil, RotateCcw, Trash2,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { PixelAvatar } from "../common/PixelAvatar";
import {
  useCurrentUser,
  useUpdateUserProfile,
  useProfiles,
  useSwitchProfile,
  useCreateProfile,
  useCopyProfile,
  useRenameProfile,
  useDeleteProfile,
} from "../../hooks/useSettings";
import { inputCls, saveBtnCls } from "./styles";

// -----------------------------------------------------------------
// App title
// -----------------------------------------------------------------

function AppTitleSection() {
  const { t } = useTranslation("settings");
  const [title, setTitle] = useState(
    () => localStorage.getItem("kaisho_app_title") || "",
  );

  function commit() {
    const val = title.trim();
    if (val) {
      localStorage.setItem("kaisho_app_title", val);
    } else {
      localStorage.removeItem("kaisho_app_title");
    }
    window.dispatchEvent(new Event("app-title-changed"));
  }

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        {t("appTitle")}
      </h2>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder="KAISHO"
          className={[
            "px-3 py-1.5 rounded text-sm w-48",
            "bg-surface-raised border border-border",
            "text-stone-900 placeholder-stone-400",
            "focus:outline-none focus:border-cta",
          ].join(" ")}
        />
        <span className="text-[10px] text-stone-400">
          {t("appTitleHint")}
        </span>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// User profile
// -----------------------------------------------------------------

function UserProfileSection() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: userData } = useCurrentUser();
  const update = useUpdateUserProfile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (userData) {
      setName(userData.name ?? "");
      setEmail(userData.email ?? "");
      setBio(userData.bio ?? "");
      setAvatarSeed(
        userData.avatar_seed || userData.name || "kaisho"
      );
    }
  }, [userData]);

  if (!userData) return null;

  function randomizeAvatar() {
    const seed = Math.random().toString(36).slice(2, 10);
    setAvatarSeed(seed);
    update.mutate({ avatar_seed: seed });
  }

  function handleSave() {
    update.mutate(
      { name, email, bio, avatar_seed: avatarSeed },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        {t("userProfile")}
      </h2>
      <div className="bg-surface-card rounded-xl border border-border p-4 flex flex-col gap-4">
        {/* Avatar + username */}
        <div className="flex items-center gap-3">
          <PixelAvatar
            seed={avatarSeed}
            size={64}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-stone-600 font-mono">
              {userData.name || "kaisho"}
            </span>
            <button
              type="button"
              onClick={randomizeAvatar}
              className="text-[10px] text-stone-500 hover:text-cta transition-colors text-left"
            >
              {t("randomizeAvatar")}
            </button>
          </div>
        </div>

        {/* Full name */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {t("fullName")}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("fullName")}
            className={inputCls}
          />
        </label>

        {/* Email */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {t("email")}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("email")}
            className={inputCls}
          />
        </label>

        {/* Bio */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {t("bio")}
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            placeholder={t("shortBio")}
            className={[inputCls, "resize-y"].join(" ")}
          />
        </label>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className={saveBtnCls}
          >
            {update.isPending
              ? tc("saving")
              : tc("save")}
          </button>
          {saved && (
            <span className="text-xs text-green-400">
              {tc("saved")}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// Profiles
// -----------------------------------------------------------------

function ProfilesTab() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: userData } = useCurrentUser();
  const { data: profileData } = useProfiles();
  const switchProfile = useSwitchProfile();
  const createProfile = useCreateProfile();
  const copyProfile = useCopyProfile();
  const renameProfile = useRenameProfile();
  const deleteProfile = useDeleteProfile();
  const [newProfile, setNewProfile] = useState("");
  const [renamingProfile, setRenamingProfile] =
    useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] =
    useState<string | null>(null);
  const [copyingProfile, setCopyingProfile] =
    useState<string | null>(null);
  const [copyValue, setCopyValue] = useState("");

  if (!userData || !profileData) return null;

  function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!newProfile.trim()) return;
    createProfile.mutate(newProfile.trim(), {
      onSuccess: () => {
        setNewProfile("");
        switchProfile.mutate(newProfile.trim(), {
          onSuccess: () => window.location.reload(),
        });
      },
      onError: () => {
        switchProfile.mutate(newProfile.trim(), {
          onSuccess: () => window.location.reload(),
        });
      },
    });
  }

  function startRename(p: string) {
    setRenamingProfile(p);
    setRenameValue(p);
  }

  function commitRename(p: string) {
    const newName = renameValue.trim();
    if (!newName || newName === p) {
      setRenamingProfile(null);
      return;
    }
    renameProfile.mutate(
      { oldName: p, newName },
      { onSettled: () => setRenamingProfile(null) },
    );
  }

  function handleDelete(p: string) {
    deleteProfile.mutate(p, {
      onSettled: () => setConfirmDelete(null),
    });
  }

  function startCopy(p: string) {
    setCopyingProfile(p);
    setCopyValue(`${p}-copy`);
  }

  function commitCopy(p: string) {
    const target = copyValue.trim();
    if (!target) {
      setCopyingProfile(null);
      return;
    }
    copyProfile.mutate(
      { name: p, target },
      { onSettled: () => setCopyingProfile(null) },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
          {t("profiles")}
        </h2>
        <p className="text-[10px] text-stone-500 mb-3">
          {t("user")}: {userData.name || "kaisho"}
          {" "}&middot; {t("activeProfile")}: {userData.profile}
        </p>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-3">
          {(profileData.profiles ?? []).map(
            (p, i, arr) => {
              const isActive = p === profileData.active;
              const isRenaming = renamingProfile === p;
              const isCopying = copyingProfile === p;
              const isConfirmingDelete =
                confirmDelete === p;
              return (
                <div
                  key={p}
                  className={[
                    "flex items-center gap-2 px-4 py-2.5",
                    i < arr.length - 1
                      ? "border-b border-border-subtle"
                      : "",
                  ].join(" ")}
                >
                  {isRenaming ? (
                    <>
                      <input
                        autoFocus
                        className={
                          inputCls + " flex-1 text-sm"
                        }
                        value={renameValue}
                        onChange={(e) =>
                          setRenameValue(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            commitRename(p);
                          if (e.key === "Escape")
                            setRenamingProfile(null);
                        }}
                      />
                      <button
                        onClick={() => commitRename(p)}
                        disabled={
                          renameProfile.isPending
                        }
                        className="p-1 rounded text-green-500 hover:text-green-400 transition-colors"
                        title={t("saveRename")}
                      >
                        <Check
                          size={13}
                          strokeWidth={2}
                        />
                      </button>
                      <button
                        onClick={() =>
                          setRenamingProfile(null)
                        }
                        className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                        title="Cancel"
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    </>
                  ) : isCopying ? (
                    <>
                      <span className="text-xs text-stone-500 shrink-0">
                        {t("copyTo", { name: p })}
                      </span>
                      <input
                        autoFocus
                        className={
                          inputCls + " flex-1 text-sm"
                        }
                        value={copyValue}
                        onChange={(e) =>
                          setCopyValue(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            commitCopy(p);
                          if (e.key === "Escape")
                            setCopyingProfile(null);
                        }}
                      />
                      <button
                        onClick={() => commitCopy(p)}
                        disabled={
                          copyProfile.isPending
                        }
                        className="p-1 rounded text-green-500 hover:text-green-400 transition-colors"
                        title={t("createCopy")}
                      >
                        <Check
                          size={13}
                          strokeWidth={2}
                        />
                      </button>
                      <button
                        onClick={() =>
                          setCopyingProfile(null)
                        }
                        className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                        title="Cancel"
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    </>
                  ) : isConfirmingDelete ? (
                    <>
                      <span className="text-xs text-stone-600 flex-1">
                        {t("deleteProfileConfirm", {
                          name: p,
                        })}
                      </span>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={
                          deleteProfile.isPending
                        }
                        className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                      >
                        {tc("delete")}
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDelete(null)
                        }
                        className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className={[
                          "text-sm flex-1",
                          isActive
                            ? "text-cta font-semibold"
                            : "text-stone-800",
                        ].join(" ")}
                      >
                        {p}
                      </span>
                      {isActive ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-cta uppercase tracking-wider font-semibold">
                            {t("activeProfile")}
                          </span>
                          <button
                            onClick={() =>
                              startCopy(p)
                            }
                            className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                            title={tc("copyProfile")}
                          >
                            <Copy
                              size={12}
                              strokeWidth={2}
                            />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              switchProfile.mutate(p, {
                                onSuccess: () =>
                                  window.location.reload(),
                              })
                            }
                            disabled={
                              switchProfile.isPending
                            }
                            className="px-2 py-1 rounded text-xs text-stone-600 hover:text-cta hover:bg-cta-muted transition-colors"
                          >
                            {tc("switch")}
                          </button>
                          <button
                            onClick={() =>
                              startCopy(p)
                            }
                            className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                            title={tc("copyProfile")}
                          >
                            <Copy
                              size={12}
                              strokeWidth={2}
                            />
                          </button>
                          <button
                            onClick={() =>
                              startRename(p)
                            }
                            className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                            title={tc("renameProfile")}
                          >
                            <Pencil
                              size={12}
                              strokeWidth={2}
                            />
                          </button>
                          <button
                            onClick={() =>
                              setConfirmDelete(p)
                            }
                            className="p-1 rounded text-stone-500 hover:text-red-500 transition-colors"
                            title={tc("deleteProfile")}
                          >
                            <Trash2
                              size={12}
                              strokeWidth={2}
                            />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            },
          )}
        </div>
        <form
          onSubmit={handleCreateProfile}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newProfile}
            onChange={(e) => setNewProfile(e.target.value)}
            placeholder={t("newProfileName")}
            className={inputCls}
          />
          <button
            type="submit"
            disabled={!newProfile.trim()}
            className={saveBtnCls}
          >
            {tc("create")}
          </button>
        </form>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

function ResetLocalStorageSection() {
  const { t } = useTranslation("settings");
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        {t("localPreferences")}
      </h2>
      <p className="text-[10px] text-stone-400 mb-3">
        {t("localPreferencesHint")}
      </p>
      <ConfirmPopover
        label={t("clearLocalPreferencesConfirm")}
        onConfirm={() => {
          localStorage.clear();
          window.location.reload();
        }}
      >
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-stone-600 border border-border hover:text-red-600 hover:border-red-300 transition-colors"
        >
          <RotateCcw size={12} />
          {t("resetLocalPreferences")}
        </button>
      </ConfirmPopover>
    </section>
  );
}

// -----------------------------------------------------------------
// Tray
// -----------------------------------------------------------------

function TraySection() {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled] = useState(true);
  const [isTauriApp, setIsTauriApp] = useState(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    setIsTauriApp(true);
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("get_tray_enabled").then((v) => {
        setEnabled(v as boolean);
      });
    }).catch(() => {});
  }, []);

  if (!isTauriApp) return null;

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_tray_enabled", { enabled: next });
    }).catch(() => {});
    localStorage.setItem(
      "kaisho_tray_enabled",
      String(next),
    );
  }

  return (
    <section>
      <h3
        className={
          "text-[10px] font-semibold uppercase "
          + "tracking-wider text-stone-500 mb-3"
        }
      >
        {t("tray") || "System Tray"}
      </h3>
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <p className="text-xs font-medium text-stone-700">
            {t("keepRunningInTray")
              || "Keep running in tray"}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">
            {t("keepRunningInTrayHint")
              || "When disabled, closing the window quits the app."}
          </p>
        </div>
        <button
          onClick={toggle}
          className={[
            "relative w-9 h-5 rounded-full",
            "transition-colors shrink-0 ml-4",
            enabled ? "bg-cta" : "bg-stone-300",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 left-0.5",
              "w-4 h-4 rounded-full bg-white",
              "shadow transition-transform",
              enabled ? "translate-x-4" : "",
            ].join(" ")}
          />
        </button>
      </label>
    </section>
  );
}

// Language
// -----------------------------------------------------------------

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
];

function LanguageSection() {
  const [, forceUpdate] = useState(0);
  // Dynamic import so this compiles even before
  // the i18n module exists.
  const lang = (
    localStorage.getItem("kaisho_lang")
    || navigator.language.split("-")[0]
    || "en"
  );

  function switchLang(code: string) {
    import("../../i18n").then(({ setLanguage }) => {
      setLanguage(code);
      forceUpdate((n) => n + 1);
    });
  }

  return (
    <section>
      <h3
        className={
          "text-[10px] font-semibold uppercase " +
          "tracking-wider text-stone-500 mb-3"
        }
      >
        Language
      </h3>
      <select
        value={lang}
        onChange={(e) => switchLang(e.target.value)}
        className={
          "px-3 py-1.5 rounded text-sm border border-border " +
          "bg-surface text-stone-700 cursor-pointer " +
          "hover:border-stone-400 focus:outline-none " +
          "focus:border-cta transition-colors"
        }
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </section>
  );
}

export function GeneralTab(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <AppTitleSection />
      <LanguageSection />
      <TraySection />
      <UserProfileSection />
      <ProfilesTab />
      <ResetLocalStorageSection />
    </div>
  );
}

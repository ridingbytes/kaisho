import { useEffect, useState } from "react";
import {
  X, Check, Copy, Pencil, Trash2,
} from "lucide-react";
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
        App Title
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
          Shown in the header next to the logo
        </span>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// User profile
// -----------------------------------------------------------------

function UserProfileSection() {
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
        User Profile
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
              Randomize avatar
            </button>
          </div>
        </div>

        {/* Full name */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Full name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={inputCls}
          />
        </label>

        {/* Email */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={inputCls}
          />
        </label>

        {/* Bio */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Bio
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            placeholder="Short bio"
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
            {update.isPending ? "Saving..." : "Save"}
          </button>
          {saved && (
            <span className="text-xs text-green-400">
              Saved
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
          Profiles
        </h2>
        <p className="text-[10px] text-stone-500 mb-3">
          User: {userData.name || userData.name || "kaisho"}
          {" "}&middot; Active: {userData.profile}
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
                        title="Save rename"
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
                        Copy{" "}
                        <strong className="text-stone-700">
                          {p}
                        </strong>{" "}
                        to:
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
                        title="Create copy"
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
                        Delete{" "}
                        <strong className="text-stone-800">
                          {p}
                        </strong>
                        ? All data will be lost.
                      </span>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={
                          deleteProfile.isPending
                        }
                        className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                      >
                        Delete
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
                            active
                          </span>
                          <button
                            onClick={() =>
                              startCopy(p)
                            }
                            className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                            title="Copy profile"
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
                            Switch
                          </button>
                          <button
                            onClick={() =>
                              startCopy(p)
                            }
                            className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                            title="Copy profile"
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
                            title="Rename profile"
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
                            title="Delete profile"
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
            placeholder="New profile name"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={!newProfile.trim()}
            className={saveBtnCls}
          >
            Create
          </button>
        </form>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

export function GeneralTab(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <AppTitleSection />
      <UserProfileSection />
      <ProfilesTab />
    </div>
  );
}

import { useEffect, useState } from "react";
import { PixelAvatar } from "../common/PixelAvatar";
import {
  fetchUsers,
  login,
  register,
  type AuthResult,
  type AuthUser,
} from "../../api/client";

interface LoginPageProps {
  onAuth: (token: string, user: AuthUser) => void;
}

const cardCls = [
  "flex items-center gap-3 px-5 py-4 rounded-xl",
  "bg-surface-card border border-border",
  "hover:border-accent hover:bg-surface-raised",
  "cursor-pointer transition-colors",
].join(" ");

const inputCls = [
  "w-full px-3 py-2 rounded-lg text-sm",
  "bg-surface-raised border border-border text-slate-200",
  "placeholder-slate-600 focus:outline-none",
  "focus:border-accent",
].join(" ");

const btnCls = [
  "w-full px-4 py-2 rounded-lg text-sm font-medium",
  "bg-accent text-white hover:bg-accent-hover",
  "transition-colors disabled:opacity-50",
].join(" ");

function UserList({
  users,
  onSelect,
}: {
  users: { username: string; name: string; bio: string }[];
  onSelect: (username: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500 mb-1">
        Choose an account
      </p>
      {users.map((u) => (
        <button
          key={u.username}
          onClick={() => onSelect(u.username)}
          className={cardCls}
        >
          <PixelAvatar seed={u.username} size={36} />
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-slate-200">
              {u.name || u.username}
            </span>
            {u.name && u.name !== u.username && (
              <span className="text-[10px] text-slate-600 font-mono">
                {u.username}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function RegisterForm({
  onRegister,
  error,
  pending,
}: {
  onRegister: (data: {
    username: string;
    name: string;
    email: string;
    bio: string;
  }) => void;
  error: string;
  pending: boolean;
}) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    onRegister({
      username: username.trim(),
      name: name.trim(),
      email: email.trim(),
      bio: bio.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      <p className="text-xs text-slate-500 mb-1">
        Create your account
      </p>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className={inputCls}
        autoFocus
        required
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        className={inputCls}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className={inputCls}
      />
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Short bio"
        rows={2}
        className={[inputCls, "resize-y"].join(" ")}
      />
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={!username.trim() || pending}
        className={btnCls}
      >
        {pending ? "Creating..." : "Create account"}
      </button>
    </form>
  );
}

export function LoginPage({ onAuth }: LoginPageProps) {
  const [users, setUsers] = useState<
    { username: string; name: string; bio: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then((list) => {
        setUsers(list);
        if (list.length === 0) setShowRegister(true);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  function handleLogin(username: string) {
    setPending(true);
    setError("");
    login(username)
      .then((res: AuthResult) => {
        localStorage.setItem("oc_token", res.token);
        onAuth(res.token, res.user);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Login failed",
        ),
      )
      .finally(() => setPending(false));
  }

  function handleRegister(data: {
    username: string;
    name: string;
    email: string;
    bio: string;
  }) {
    setPending(true);
    setError("");
    register(data)
      .then((res: AuthResult) => {
        localStorage.setItem("oc_token", res.token);
        onAuth(res.token, res.user);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Register failed",
        ),
      )
      .finally(() => setPending(false));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-surface">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-slate-200 mb-1 text-center">
          OmniControl
        </h1>
        <p className="text-xs text-slate-600 mb-6 text-center">
          {showRegister
            ? "Set up your first account"
            : "Sign in to continue"}
        </p>

        {error && !showRegister && (
          <p className="text-xs text-red-400 mb-3">
            {error}
          </p>
        )}

        {showRegister ? (
          <>
            <RegisterForm
              onRegister={handleRegister}
              error={error}
              pending={pending}
            />
            {users.length > 0 && (
              <button
                onClick={() => {
                  setShowRegister(false);
                  setError("");
                }}
                className="mt-3 text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                Back to login
              </button>
            )}
          </>
        ) : (
          <>
            <UserList
              users={users}
              onSelect={handleLogin}
            />
            <button
              onClick={() => {
                setShowRegister(true);
                setError("");
              }}
              className="mt-4 text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Create a new account
            </button>
          </>
        )}
      </div>
    </div>
  );
}

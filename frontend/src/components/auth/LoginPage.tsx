import { useState } from "react";
import { PixelAvatar } from "../common/PixelAvatar";
import {
  login,
  register,
  type AuthUser,
} from "../../api/client";

interface LoginPageProps {
  onAuth: (token: string, user: AuthUser) => void;
}

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

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function sanitizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

export function LoginPage({ onAuth }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">(
    "login"
  );
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const validUsername =
    username.length >= 2 && USERNAME_RE.test(username);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setPending(true);
    setError("");
    login(username.trim())
      .then((res) => {
        localStorage.setItem("oc_token", res.token);
        onAuth(res.token, res.user);
      })
      .catch(() => setError("User not found"))
      .finally(() => setPending(false));
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!validUsername) return;
    setPending(true);
    setError("");
    register({
      username,
      name: name.trim(),
      email: email.trim(),
      bio: bio.trim(),
    })
      .then((res) => {
        localStorage.setItem("oc_token", res.token);
        onAuth(res.token, res.user);
      })
      .catch(() => setError("Username already taken"))
      .finally(() => setPending(false));
  }

  return (
    <div className="flex items-center justify-center h-full bg-surface">
      <div className="w-full max-w-sm p-6">
        <div className="flex justify-center mb-4">
          <div className="w-3 h-3 rounded-full bg-accent" />
        </div>
        <h1 className="text-lg font-semibold text-slate-200 mb-1 text-center">
          OmniControl
        </h1>
        <p className="text-xs text-slate-600 mb-6 text-center">
          {mode === "login"
            ? "Sign in to continue"
            : "Create your account"}
        </p>

        {mode === "login" ? (
          <form
            onSubmit={handleLogin}
            className="flex flex-col gap-3"
          >
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className={inputCls}
              autoFocus
              required
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={!username.trim() || pending}
              className={btnCls}
            >
              {pending ? "Signing in..." : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Create a new account
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleRegister}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-3">
              <PixelAvatar
                seed={username || "?"}
                size={48}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={username}
                  onChange={(e) =>
                    setUsername(sanitizeUsername(e.target.value))
                  }
                  placeholder="Username"
                  className={inputCls}
                  autoFocus
                  required
                />
                {username.length > 0 && !validUsername && (
                  <p className="text-[10px] text-amber-400 mt-0.5">
                    Lowercase a-z, 0-9, - and _ only (min 2)
                  </p>
                )}
                <p className="text-[10px] text-slate-700 mt-0.5">
                  Cannot be changed later
                </p>
              </div>
            </div>
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
              disabled={!validUsername || pending}
              className={btnCls}
            >
              {pending ? "Creating..." : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Already have an account? Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

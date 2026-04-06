import { useState } from "react";
import { PixelAvatar } from "../common/PixelAvatar";
import {
  login,
  register,
  setPassword,
  type AuthUser,
} from "../../api/client";

interface LoginPageProps {
  onAuth: (token: string, user: AuthUser) => void;
}

const inputCls = [
  "w-full px-3 py-2 rounded-lg text-sm",
  "bg-surface-raised border border-border text-stone-900",
  "placeholder-stone-500 focus:outline-none",
  "focus:border-cta",
].join(" ");

const btnCls = [
  "w-full px-4 py-2 rounded-lg text-sm font-medium",
  "bg-cta text-white hover:bg-cta-hover",
  "transition-colors disabled:opacity-50",
].join(" ");

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function sanitizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

type Mode = "login" | "register" | "set-password";

export function LoginPage({ onAuth }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPasswordVal] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  // Stashed after passwordless login
  const [stashedToken, setStashedToken] = useState("");
  const [stashedUser, setStashedUser] = useState<AuthUser | null>(
    null
  );

  const validUsername =
    username.length >= 2 && USERNAME_RE.test(username);

  function finishAuth(token: string, user: AuthUser) {
    localStorage.setItem("kai_token", token);
    onAuth(token, user);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setPending(true);
    setError("");
    login(username.trim(), password)
      .then((res) => {
        if (!res.password_set) {
          // No password yet — prompt to set one
          setStashedToken(res.token);
          setStashedUser(res.user);
          localStorage.setItem("kai_token", res.token);
          setMode("set-password");
          setPasswordVal("");
        } else {
          finishAuth(res.token, res.user);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error
          ? err.message
          : "Login failed";
        if (msg.includes("401")) {
          setError("Invalid password");
        } else if (msg.includes("404")) {
          setError("User not found");
        } else {
          setError(msg);
        }
      })
      .finally(() => setPending(false));
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!validUsername) return;
    setPending(true);
    setError("");
    register({
      username,
      password,
      name: name.trim(),
      email: email.trim(),
      bio: bio.trim(),
    })
      .then((res) => finishAuth(res.token, res.user))
      .catch(() => setError("Username already taken"))
      .finally(() => setPending(false));
  }

  function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 4) {
      setError("At least 4 characters");
      return;
    }
    setPending(true);
    setError("");
    setPassword(password)
      .then(() => {
        if (stashedToken && stashedUser) {
          finishAuth(stashedToken, stashedUser);
        }
      })
      .catch(() => setError("Failed to set password"))
      .finally(() => setPending(false));
  }

  function skipPassword() {
    if (stashedToken && stashedUser) {
      finishAuth(stashedToken, stashedUser);
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-surface">
      <div className="w-full max-w-sm p-6">
        <div className="flex justify-center mb-6">
          <img
            src="/kaisho-wordmark.svg"
            alt="Kaisho"
            className="h-6"
          />
        </div>
        <p className="text-xs text-stone-500 mb-6 text-center">
          {mode === "login" && "Sign in to continue"}
          {mode === "register" && "Create your account"}
          {mode === "set-password" &&
            "Secure your account with a password"}
        </p>

        {/* Login */}
        {mode === "login" && (
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              placeholder="Password"
              className={inputCls}
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
                setPasswordVal("");
              }}
              className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              Create a new account
            </button>
          </form>
        )}

        {/* Register */}
        {mode === "register" && (
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
                    setUsername(
                      sanitizeUsername(e.target.value)
                    )
                  }
                  placeholder="Username"
                  className={inputCls}
                  autoFocus
                  required
                />
                {username.length > 0 && !validUsername && (
                  <p className="text-[10px] text-amber-400 mt-0.5">
                    a-z, 0-9, - and _ only (min 2)
                  </p>
                )}
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Cannot be changed later
                </p>
              </div>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              placeholder="Password"
              className={inputCls}
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
                setPasswordVal("");
              }}
              className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              Already have an account? Sign in
            </button>
          </form>
        )}

        {/* Set password prompt (after passwordless login) */}
        {mode === "set-password" && (
          <form
            onSubmit={handleSetPassword}
            className="flex flex-col gap-3"
          >
            <p className="text-xs text-stone-700">
              No password set yet. Set one to protect your
              account, or skip for now.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              placeholder="Choose a password (min 4 chars)"
              className={inputCls}
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={password.length < 4 || pending}
              className={btnCls}
            >
              {pending ? "Setting..." : "Set password"}
            </button>
            <button
              type="button"
              onClick={skipPassword}
              className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              Skip for now
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

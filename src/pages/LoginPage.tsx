import { useState, type FormEvent } from "react";
import logo from "../assets/inside_app_logo.png";
import { errorMessage } from "../api/types";
import { useSession } from "../auth/SessionContext";
import { EnvironmentBadge } from "../components/EnvironmentBadge";

const FIELD_CLASSES =
  "w-full min-h-[52px] rounded-[10px] bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.08)] " +
  "placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function LoginPage() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSigningIn || !email || !password) return;
    setError(null);
    setIsSigningIn(true);
    try {
      await session.login(email.trim(), password);
    } catch (thrown) {
      setError(errorMessage(thrown));
      setIsSigningIn(false);
    }
  }

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5">
        <header className="flex flex-col items-center gap-4 pt-12">
          <img src={logo} alt="SurgiScribe logo" className="h-[60px]" />
          <EnvironmentBadge />
        </header>

        <form onSubmit={handleSubmit} className="mt-[12vh] flex flex-col gap-3">
          <h1 className="mb-2 text-2xl font-medium text-gray-900">
            Login to your Account
          </h1>

          <input
            type="email"
            placeholder="Email address"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASSES}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${FIELD_CLASSES} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-4 text-gray-400 hover:text-gray-600"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          <div className="text-right">
            <button type="button" className="text-sm text-gray-800 hover:underline">
              Forgot Password?
            </button>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={isSigningIn || !email || !password}
            className="mt-14 flex min-h-[50px] w-full items-center justify-center rounded-full
                       bg-brand font-semibold text-white transition
                       hover:bg-brand-dark disabled:pointer-events-none disabled:opacity-60"
          >
            {isSigningIn ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                role="status"
                aria-label="Signing in"
              />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <footer className="mt-auto pb-8 pt-12 text-center text-sm text-gray-800">
          Don’t have an account?{" "}
          <button type="button" className="font-bold text-brand hover:underline">
            Sign up
          </button>
        </footer>
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7c2.2 0 4.1.8 5.6 1.9M22 12s-3.5 7-10 7c-2.2 0-4.1-.8-5.6-1.9" />
          <path d="m3 3 18 18" />
        </>
      )}
    </svg>
  );
}

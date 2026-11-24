import React, { useState } from "react";
import { AlertCircle, Eye, EyeOff, Lock, LogIn, ShieldCheck, UserCheck, X } from "lucide-react";
import { loginAdmin } from "../utils/auth";

interface LoginPageProps {
  mode: "gate" | "modal";
  onLoginSuccess: () => void;
  onContinueViewer: () => void;
  onClose?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  mode,
  onLoginSuccess,
  onContinueViewer,
  onClose,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await loginAdmin(username, password);
      if (res.ok) {
        onLoginSuccess();
      } else {
        setError(res.error || "Invalid username or password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const card = (
    <div
      className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative bg-gradient-to-br from-[#1B365D] via-[#1B365D] to-[#0F2442] px-6 py-5 text-white">
        {mode === "modal" && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close login dialog"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="flex flex-col items-center text-center">
          <div className="rounded-xl bg-white px-4 py-2 shadow-sm">
            <img
              src="/mfc-logo.png"
              alt="Misr Flying College Crest"
              className="h-11 w-auto object-contain"
            />
          </div>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-blue-200">
            Egyptian Aviation Academy
          </p>
          <h1 className="mt-0.5 text-lg font-extrabold tracking-tight">
            Misr Flying College — Flight Ops
          </h1>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-blue-100">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            Assiut Airport (HEAT) · v4.0 Admin Access
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-[#1B365D]">
          <strong>Schedule Modification Protected:</strong> Only administrators can edit schedules,
          rosters, aircraft, or save shared templates. Students &amp; crew can view and print in{" "}
          <strong>Read-Only</strong> mode.
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-[#C00000]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="mfc-login-username"
            className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-slate-600"
          >
            Username
          </label>
          <div className="relative">
            <UserCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="mfc-login-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-[#1B365D] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="mfc-login-password"
            className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-slate-600"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="mfc-login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-11 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-[#1B365D] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B365D] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#142947] active:bg-[#0F2038] disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" />
          <span>{submitting ? "Verifying Credentials..." : "Sign In as Admin"}</span>
        </button>

        <div className="relative flex items-center py-0.5">
          <div className="grow border-t border-slate-200" />
          <span className="mx-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            or
          </span>
          <div className="grow border-t border-slate-200" />
        </div>

        <button
          type="button"
          onClick={mode === "modal" && onClose ? onClose : onContinueViewer}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
        >
          <Eye className="h-4 w-4 text-slate-500" />
          <span>
            {mode === "modal" ? "Continue in Read-Only Mode" : "Continue as Viewer (Read-Only)"}
          </span>
        </button>
      </form>
    </div>
  );

  if (mode === "modal") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs print:hidden"
        onClick={onClose}
      >
        {card}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 px-4 py-8 print:hidden">
      {card}
      <p className="mt-4 text-center text-[11px] font-medium text-slate-500">
        Misr Flying College · HEAT Detachment Dispatch &amp; Operational Documents Portal
      </p>
    </div>
  );
};

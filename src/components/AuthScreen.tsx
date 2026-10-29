import React, { useState } from 'react';
import { Language, translations } from '../lib/i18n.ts';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Globe,
  Lock,
  Mail,
  Smartphone,
} from 'lucide-react';
import { PWAInstallButton } from './AndroidApkAndMobileCenter.tsx';

interface AuthScreenProps {
  lang: Language;
  onToggleLang: () => void;
  onLoginSuccess: (token: string, initialWorkspace?: any) => Promise<void> | void;
  externalError?: string | null;
  onOpenGuide?: () => void;
}

const SAVED_CREDENTIALS_KEY = 'velopulse_saved_credentials';

export function AuthScreen({
  lang,
  onToggleLang,
  onLoginSuccess,
  externalError,
  onOpenGuide,
}: AuthScreenProps) {
  const t = translations[lang];
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.email || '';
      }
    } catch {
      // Ignore storage errors
    }
    return '';
  });
  const [password, setPassword] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.password || '';
      }
    } catch {
      // Ignore storage errors
    }
    return '';
  });
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      try {
        if (rememberMe) {
          localStorage.setItem(
            SAVED_CREDENTIALS_KEY,
            JSON.stringify({ email: trimmedEmail, password })
          );
        } else {
          localStorage.removeItem(SAVED_CREDENTIALS_KEY);
        }
      } catch {
        // Ignore storage errors
      }

      await onLoginSuccess(data.token, data.workspace);
    } catch (err: any) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Password reset request failed');
      }
      setResetMessage(data.message);
    } catch (err: any) {
      setError(err.message || 'Failed to request password recovery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Minimal Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          {t.appName}
        </a>

        <div className="flex items-center gap-2">
          <a
            href="/api/mobile/download-apk"
            download="VeloPulse-Enterprise-v1.0.0.apk"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {lang === 'ar' ? 'تحميل تطبيق الأندرويد APK' : 'Download Android APK'}
            </span>
          </a>
          <PWAInstallButton lang={lang} />
          {onOpenGuide && (
            <button
              type="button"
              onClick={onOpenGuide}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>دليل المستخدم (PDF)</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </div>
      </header>

      {/* Centered Simple Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 shadow-xs">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              {mode === 'login' ? t.signInTitle : t.resetPasswordTitle}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {mode === 'login'
                ? lang === 'ar'
                  ? 'أدخل البريد الإلكتروني وكلمة المرور للمتابعة'
                  : 'Enter your email and password to sign in'
                : t.resetPasswordDesc}
            </p>
          </div>

          {(error || externalError) && (
            <div
              role="alert"
              className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-md flex items-start gap-2.5 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error || externalError}</span>
            </div>
          )}

          {resetMessage && (
            <div
              role="status"
              className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2.5 text-xs text-emerald-800"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{resetMessage}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.emailLabel}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-700"
                  >
                    {t.passwordLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setError(null);
                    }}
                    className="text-xs text-indigo-700 hover:underline font-medium cursor-pointer"
                  >
                    {t.forgotPassword}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    {lang === 'ar'
                      ? 'تذكر بيانات الدخول والبقاء متصلاً دائماً'
                      : 'Remember credentials & keep me signed in'}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? 'Authenticating...' : t.signInButton}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.emailLabel}
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-sm font-medium transition-colors cursor-pointer"
              >
                {loading ? 'Sending...' : t.sendResetButton}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setResetMessage(null);
                }}
                className="w-full py-2 px-4 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {t.backToLogin}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-slate-200 bg-white text-center space-y-1">
        <p className="text-xs text-slate-500">{t.appName}</p>
        <p className="text-[11px] font-light text-slate-400">
          تم برمجته بواسطة مهندس محمد ابراهيم
        </p>
      </footer>
    </div>
  );
}

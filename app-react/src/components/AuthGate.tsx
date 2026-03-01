import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

interface AuthGateProps {
  children: (user: User) => JSX.Element;
}

export function AuthGate({ children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accountOpen) return;

    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!accountRef.current || (target && accountRef.current.contains(target))) return;
      setAccountOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [accountOpen]);

  const info = useMemo(() => {
    if (hasSupabaseConfig) return null;
    return "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.";
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setError(null);
    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) setError(signUpError.message);
      else setError("Cadastro enviado. Verifique seu e-mail.");
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) setError(loginError.message);
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="center-screen login-bg">
        <div className="loading-indicator">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Carregando...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <>
        <div className="top-account" ref={accountRef}>
          <button
            type="button"
            className="top-account-btn"
            onClick={() => setAccountOpen((prev) => !prev)}
            aria-label="Conta"
            aria-expanded={accountOpen}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="8" r="3.2" />
              <path d="M4.8 19.2c1.2-3 3.8-4.7 7.2-4.7s6 1.7 7.2 4.7" />
            </svg>
          </button>
          {accountOpen && (
            <div className="top-account-pop" role="dialog" aria-label="Informacoes da conta">
              <p>{user.email}</p>
              <button type="button" onClick={handleLogout}>
                Sair
              </button>
            </div>
          )}
        </div>
        {children(user)}
      </>
    );
  }

  return (
    <div className="center-screen login-bg">
      <div className="auth-card">
        <h1>Financeiro</h1>
        <p>Faca login para continuar.</p>
        {info && <p className="info">{info}</p>}
        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">{isSignUp ? "Criar conta" : "Entrar"}</button>
        </form>
        <button className="link-btn" onClick={() => setIsSignUp((v) => !v)}>
          {isSignUp ? "Ja tenho conta" : "Criar nova conta"}
        </button>
      </div>
    </div>
  );
}

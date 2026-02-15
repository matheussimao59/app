import { FormEvent, useEffect, useMemo, useState } from "react";
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
    return <div className="center-screen">Carregando...</div>;
  }

  if (user) {
    return (
      <>
        <div className="top-user">
          <span>{user.email}</span>
          <button onClick={handleLogout}>Sair</button>
        </div>
        {children(user)}
      </>
    );
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <h1>Financeiro</h1>
        <p>Faça login para continuar.</p>
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
          {isSignUp ? "Já tenho conta" : "Criar nova conta"}
        </button>
      </div>
    </div>
  );
}

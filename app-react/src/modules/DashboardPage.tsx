import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest, getApiToken } from "../lib/api";
import { hasApiConfig, hasSupabaseConfig, supabase } from "../lib/supabase";
import { UiIcon } from "../components/UiIcon";

type Category = {
  id: string;
  user_id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
  monthly_budget: number | null;
  active: boolean;
};

type Account = {
  id: string;
  user_id: string;
  name: string;
  bank: string | null;
  initial_balance: number;
  current_balance: number;
  active: boolean;
};

type FinancialTx = {
  id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  entry_type: "income" | "expense";
  status: "pending" | "paid";
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  receipt_image_data: string | null;
  receipt_image_name: string | null;
  invoice_image_data: string | null;
  invoice_image_name: string | null;
  created_at: string;
};

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Materia prima", color: "#16a34a", monthly_budget: 0 },
  { name: "Pessoal", color: "#2563eb", monthly_budget: 0 },
  { name: "Empresa", color: "#7c3aed", monthly_budget: 0 },
  { name: "Impostos", color: "#dc2626", monthly_budget: 0 },
  { name: "Frete", color: "#0ea5e9", monthly_budget: 0 },
  { name: "Marketing", color: "#f97316", monthly_budget: 0 }
];

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function money(value: number) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toNumber(value: string) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function currentApiToken() {
  return getApiToken();
}

type FinanceIconId =
  | "wallet"
  | "up"
  | "down"
  | "result"
  | "alert"
  | "clock"
  | "calendar"
  | "pulse"
  | "chart"
  | "list"
  | "bank"
  | "category"
  | "plus"
  | "settings"
  | "refresh"
  | "file";

function FinanceIcon({ id }: { id: FinanceIconId }) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9" } as const;

  if (id === "wallet") return <svg {...props}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M15 12h6M15 10h3" /></svg>;
  if (id === "up") return <svg {...props}><path d="M12 19V5" /><path d="M7.5 9.5 12 5l4.5 4.5" /></svg>;
  if (id === "down") return <svg {...props}><path d="M12 5v14" /><path d="m7.5 14.5 4.5 4.5 4.5-4.5" /></svg>;
  if (id === "result") return <svg {...props}><path d="M4 16 9 11l4 3 7-7" /><path d="M17 7h3v3" /></svg>;
  if (id === "alert") return <svg {...props}><path d="M12 8v5" /><circle cx="12" cy="16.6" r="0.8" /><path d="M10 3.8h4l6.2 10.7A2 2 0 0 1 18.5 18h-13a2 2 0 0 1-1.7-3.5z" /></svg>;
  if (id === "clock") return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.7V12l3 2" /></svg>;
  if (id === "calendar") return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
  if (id === "pulse") return <svg {...props}><path d="M3 12h4l2-4 3 8 2-4h7" /></svg>;
  if (id === "chart") return <svg {...props}><path d="M4 19h16" /><rect x="6" y="11" width="2.8" height="6" /><rect x="10.6" y="8" width="2.8" height="9" /><rect x="15.2" y="5" width="2.8" height="12" /></svg>;
  if (id === "list") return <svg {...props}><path d="M8 7h12M8 12h12M8 17h12" /><circle cx="4" cy="7" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="17" r="1" /></svg>;
  if (id === "bank") return <svg {...props}><path d="M3 9 12 4l9 5v2H3zM5 11v6M9 11v6M15 11v6M19 11v6M3 19h18" /></svg>;
  if (id === "category") return <svg {...props}><path d="M4 6h7v7H4zM13 6h7v4h-7zM13 12h7v7h-7zM4 15h7v4H4z" /></svg>;
  if (id === "plus") return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
  if (id === "settings") return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.1M12 19.1v2.1M4.8 4.8l1.5 1.5M17.7 17.7l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.8 19.2l1.5-1.5M17.7 6.3l1.5-1.5" /></svg>;
  if (id === "file") return <svg {...props}><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  return <svg {...props}><path d="M4 12h16M12 4v16" /></svg>;
}

export function DashboardPage() {
  const todayYmd = toYmd(new Date());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<FinancialTx[]>([]);

  const [entryType, setEntryType] = useState<"income" | "expense">("expense");
  const [entryStatus, setEntryStatus] = useState<"pending" | "paid">("pending");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDueDate, setEntryDueDate] = useState(todayYmd);
  const [entryPaidDate, setEntryPaidDate] = useState(todayYmd);
  const [entryCategoryId, setEntryCategoryId] = useState("");
  const [entryAccountId, setEntryAccountId] = useState("");
  const [entryReceiptFile, setEntryReceiptFile] = useState<File | null>(null);
  const [entryInvoiceFile, setEntryInvoiceFile] = useState<File | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryKind, setNewCategoryKind] = useState<"income" | "expense">("expense");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBank, setNewAccountBank] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [showTxModal, setShowTxModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [showCategoryHealthModal, setShowCategoryHealthModal] = useState(false);

  function clearEntryFiles() {
    setEntryReceiptFile(null);
    setEntryInvoiceFile(null);
  }

  function closeTxModal() {
    clearEntryFiles();
    setShowTxModal(false);
  }

  function onPickFiscalFile(kind: "receipt" | "invoice", file?: File | null) {
    if (!file) {
      if (kind === "receipt") setEntryReceiptFile(null);
      else setEntryInvoiceFile(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Anexe apenas imagem para cupom/nota fiscal.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Cada imagem deve ter no maximo 3MB.");
      return;
    }
    setError(null);
    if (kind === "receipt") setEntryReceiptFile(file);
    else setEntryInvoiceFile(file);
  }

  async function loadAll(uid: string) {
    if (hasApiConfig && !hasSupabaseConfig) {
      const token = currentApiToken();
      const data = await apiRequest<{ categories: Category[]; accounts: Account[]; transactions: FinancialTx[] }>(
        "/financial/dashboard",
        { token }
      );

      const catRows = (data.categories || []).map((row) => ({
        ...row,
        id: String(row.id),
        user_id: String(row.user_id),
        monthly_budget: row.monthly_budget == null ? null : Number(row.monthly_budget)
      }));
      setCategories(catRows);
      setAccounts((data.accounts || []).map((a) => ({
        ...a,
        id: String(a.id),
        user_id: String(a.user_id),
        initial_balance: Number(a.initial_balance) || 0,
        current_balance: Number(a.current_balance) || 0
      })));
      setTransactions((data.transactions || []).map((t) => ({
        ...t,
        id: String(t.id),
        user_id: String(t.user_id),
        category_id: t.category_id ? String(t.category_id) : null,
        account_id: t.account_id ? String(t.account_id) : null,
        amount: Number(t.amount) || 0
      })));

      if (catRows.length === 0) {
        for (const row of DEFAULT_EXPENSE_CATEGORIES) {
          await apiRequest("/financial/categories", {
            method: "POST",
            token,
            body: {
              name: row.name,
              kind: "expense",
              color: row.color,
              monthly_budget: row.monthly_budget
            }
          });
        }
        const seeded = await apiRequest<{ categories: Category[] }>("/financial/categories", { token });
        setCategories(
          (seeded.categories || []).map((row) => ({
            ...row,
            id: String(row.id),
            user_id: String(row.user_id),
            monthly_budget: row.monthly_budget == null ? null : Number(row.monthly_budget)
          }))
        );
      }
      return;
    }

    if (!supabase) return;

    const [catRes, accRes, txRes] = await Promise.all([
      supabase
        .from("financial_categories")
        .select("*")
        .eq("user_id", uid)
        .order("kind", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("financial_accounts")
        .select("*")
        .eq("user_id", uid)
        .order("name", { ascending: true }),
      supabase
        .from("financial_transactions")
        .select("*")
        .eq("user_id", uid)
        .order("due_date", { ascending: true })
        .limit(3000)
    ]);

    if (catRes.error) throw new Error(`Categorias: ${catRes.error.message}`);
    if (accRes.error) throw new Error(`Contas: ${accRes.error.message}`);
    if (txRes.error) throw new Error(`Lancamentos: ${txRes.error.message}`);

    const catRows = (catRes.data || []) as Category[];
    setCategories(catRows);
    setAccounts(((accRes.data || []) as Account[]).map((a) => ({ ...a, current_balance: Number(a.current_balance) || 0 })));
    setTransactions(((txRes.data || []) as FinancialTx[]).map((t) => ({ ...t, amount: Number(t.amount) || 0 })));

    if (catRows.length === 0) {
      await supabase.from("financial_categories").insert(
        DEFAULT_EXPENSE_CATEGORIES.map((row) => ({
          user_id: uid,
          name: row.name,
          kind: "expense",
          color: row.color,
          monthly_budget: row.monthly_budget
        }))
      );
      const { data: seeded } = await supabase
        .from("financial_categories")
        .select("*")
        .eq("user_id", uid)
        .order("kind", { ascending: true })
        .order("name", { ascending: true });
      setCategories((seeded || []) as Category[]);
    }
  }

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);

      if (hasApiConfig && !hasSupabaseConfig) {
        const token = currentApiToken();
        if (!token) {
          setError("Usuario nao autenticado.");
          setLoading(false);
          return;
        }

        setUserId("api");
        try {
          await loadAll("api");
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao carregar dados financeiros.";
          setError(message);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (!supabase) {
        setError("Supabase nao configurado.");
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(`Falha na autenticacao: ${authError.message}`);
        setLoading(false);
        return;
      }

      const uid = authData.user?.id || null;
      setUserId(uid);
      if (!uid) {
        setError("Usuario nao autenticado.");
        setLoading(false);
        return;
      }

      try {
        await loadAll(uid);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha ao carregar dados financeiros.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, []);

  const expenseCategories = useMemo(() => categories.filter((c) => c.kind === "expense"), [categories]);
  const incomeCategories = useMemo(() => categories.filter((c) => c.kind === "income"), [categories]);

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = toYmd(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const futureLimit = toYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

    const paidMonth = transactions.filter((tx) => tx.status === "paid" && (tx.paid_date || "") >= monthStart && (tx.paid_date || "") <= monthEnd);
    const receitaMes = paidMonth.filter((tx) => tx.entry_type === "income").reduce((acc, tx) => acc + tx.amount, 0);
    const despesaMes = paidMonth.filter((tx) => tx.entry_type === "expense").reduce((acc, tx) => acc + tx.amount, 0);

    const pendentes = transactions.filter((tx) => tx.status === "pending");
    const vencidos = pendentes.filter((tx) => tx.due_date < todayYmd);
    const vencendo = pendentes.filter((tx) => tx.due_date >= todayYmd && tx.due_date <= futureLimit);
    const futuros = pendentes.filter((tx) => tx.due_date > futureLimit);

    const saldoAtual = accounts.reduce((acc, account) => acc + (Number(account.current_balance) || 0), 0);
    const pendingIn = pendentes.filter((tx) => tx.entry_type === "income").reduce((acc, tx) => acc + tx.amount, 0);
    const pendingOut = pendentes.filter((tx) => tx.entry_type === "expense").reduce((acc, tx) => acc + tx.amount, 0);
    const saldoProjetado = saldoAtual + pendingIn - pendingOut;

    let score = 100;
    const ratio = receitaMes > 0 ? despesaMes / receitaMes : 1.5;
    if (ratio > 1) score -= 30;
    else if (ratio > 0.8) score -= 15;
    score -= Math.min(25, vencidos.length * 5);
    if (saldoProjetado < 0) score -= 20;
    score = Math.max(0, Math.min(100, score));

    const healthLabel = score >= 80 ? "Saudavel" : score >= 60 ? "Atencao" : "Critico";

    return {
      saldoAtual,
      receitaMes,
      despesaMes,
      resultadoMes: receitaMes - despesaMes,
      vencidos,
      vencendo,
      futuros,
      saldoProjetado,
      score,
      healthLabel
    };
  }, [transactions, accounts, todayYmd]);

  const expenseByCategory = useMemo(() => {
    const now = new Date();
    const monthStart = toYmd(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.entry_type !== "expense" || tx.status !== "paid") continue;
      const paid = tx.paid_date || "";
      if (paid < monthStart || paid > monthEnd) continue;
      const key = tx.category_id || "sem-categoria";
      map.set(key, (map.get(key) || 0) + tx.amount);
    }

    return [...map.entries()]
      .map(([categoryId, total]) => {
        const cat = categories.find((c) => c.id === categoryId) || null;
        const budget = Number(cat?.monthly_budget) || 0;
        const healthPct = budget > 0 ? (total / budget) * 100 : null;
        return {
          categoryId,
          name: cat?.name || "Sem categoria",
          color: cat?.color || "#64748b",
          total,
          budget,
          healthPct
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [transactions, categories]);

  async function refresh() {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await loadAll(userId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao atualizar dados.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function createTransaction(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;

    const amount = toNumber(entryAmount);
    if (!entryDescription.trim() || amount <= 0) {
      setError("Informe descricao e valor valido.");
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      if (hasApiConfig && !hasSupabaseConfig) {
        await apiRequest("/financial/transactions", {
          method: "POST",
          token: currentApiToken(),
          body: {
            category_id: entryCategoryId ? Number(entryCategoryId) : null,
            account_id: entryAccountId ? Number(entryAccountId) : null,
            entry_type: entryType,
            status: entryStatus,
            description: entryDescription.trim(),
            amount,
            due_date: entryDueDate,
            paid_date: entryStatus === "paid" ? entryPaidDate : null,
            notes: null
          }
        });
      } else {
        if (!supabase) return;
        const receiptImageData = entryReceiptFile ? await fileToDataUrl(entryReceiptFile) : null;
        const invoiceImageData = entryInvoiceFile ? await fileToDataUrl(entryInvoiceFile) : null;

        const payload = {
          user_id: userId,
          category_id: entryCategoryId || null,
          account_id: entryAccountId || null,
          entry_type: entryType,
          status: entryStatus,
          description: entryDescription.trim(),
          amount,
          due_date: entryDueDate,
          paid_date: entryStatus === "paid" ? entryPaidDate : null,
          receipt_image_data: receiptImageData,
          receipt_image_name: entryReceiptFile?.name || null,
          invoice_image_data: invoiceImageData,
          invoice_image_name: entryInvoiceFile?.name || null,
          updated_at: new Date().toISOString()
        };

        const { error: txError } = await supabase.from("financial_transactions").insert(payload);
        if (txError) throw new Error(txError.message);

        if (entryStatus === "paid" && entryAccountId) {
          const target = accounts.find((a) => a.id === entryAccountId);
          if (target) {
            const delta = entryType === "income" ? amount : -amount;
            const nextBalance = (Number(target.current_balance) || 0) + delta;
            const { error: accountError } = await supabase
              .from("financial_accounts")
              .update({ current_balance: nextBalance, updated_at: new Date().toISOString() })
              .eq("user_id", userId)
              .eq("id", target.id);
            if (accountError) throw new Error(accountError.message);
          }
        }
      }

      setEntryDescription("");
      setEntryAmount("");
      setEntryStatus("pending");
      setEntryDueDate(todayYmd);
      setEntryPaidDate(todayYmd);
      setEntryCategoryId("");
      setEntryAccountId("");
      clearEntryFiles();
      setShowTxModal(false);
      setStatus("Lancamento salvo com sucesso.");
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao salvar lancamento.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    if (!newCategoryName.trim()) return;

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      if (hasApiConfig && !hasSupabaseConfig) {
        await apiRequest("/financial/categories", {
          method: "POST",
          token: currentApiToken(),
          body: {
            name: newCategoryName.trim(),
            kind: newCategoryKind,
            monthly_budget: toNumber(newCategoryBudget) || null
          }
        });
      } else {
        if (!supabase) return;
        const payload = {
          user_id: userId,
          name: newCategoryName.trim(),
          kind: newCategoryKind,
          monthly_budget: toNumber(newCategoryBudget) || null,
          updated_at: new Date().toISOString()
        };
        const { error: catError } = await supabase.from("financial_categories").insert(payload);
        if (catError) throw new Error(catError.message);
      }

      setNewCategoryName("");
      setNewCategoryBudget("");
      setStatus("Categoria criada.");
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao criar categoria.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    if (!newAccountName.trim()) return;

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const startBalance = toNumber(newAccountBalance);
      if (hasApiConfig && !hasSupabaseConfig) {
        await apiRequest("/financial/accounts", {
          method: "POST",
          token: currentApiToken(),
          body: {
            name: newAccountName.trim(),
            bank: newAccountBank.trim() || null,
            initial_balance: startBalance
          }
        });
      } else {
        if (!supabase) return;
        const payload = {
          user_id: userId,
          name: newAccountName.trim(),
          bank: newAccountBank.trim() || null,
          initial_balance: startBalance,
          current_balance: startBalance,
          updated_at: new Date().toISOString()
        };
        const { error: accError } = await supabase.from("financial_accounts").insert(payload);
        if (accError) throw new Error(accError.message);
      }

      setNewAccountName("");
      setNewAccountBank("");
      setNewAccountBalance("");
      setStatus("Conta criada.");
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao criar conta.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!userId || !categoryId) return;
    const ok = window.confirm("Excluir esta categoria? Lancamentos vinculados ficarao sem categoria.");
    if (!ok) return;

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      if (hasApiConfig && !hasSupabaseConfig) {
        await apiRequest(`/financial/categories/${categoryId}`, {
          method: "DELETE",
          token: currentApiToken()
        });
      } else {
        if (!supabase) return;
        const { error: delError } = await supabase
          .from("financial_categories")
          .delete()
          .eq("user_id", userId)
          .eq("id", categoryId);
        if (delError) throw new Error(delError.message);
      }
      setStatus("Categoria excluida.");
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao excluir categoria.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const upcomingRows = useMemo(
    () => transactions.filter((tx) => tx.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 20),
    [transactions]
  );
  const upcomingPreview = useMemo(() => upcomingRows.slice(0, 6), [upcomingRows]);
  const overdueAmount = useMemo(() => metrics.vencidos.reduce((sum, row) => sum + row.amount, 0), [metrics.vencidos]);
  const dueSoonAmount = useMemo(() => metrics.vencendo.reduce((sum, row) => sum + row.amount, 0), [metrics.vencendo]);
  const pendingAmount = useMemo(
    () => transactions.filter((tx) => tx.status === "pending").reduce((sum, row) => sum + row.amount, 0),
    [transactions]
  );
  const overduePct = pendingAmount > 0 ? Math.min(100, (overdueAmount / pendingAmount) * 100) : 0;
  const dueSoonPct = pendingAmount > 0 ? Math.min(100, (dueSoonAmount / pendingAmount) * 100) : 0;
  const expenseVsIncomePct = metrics.receitaMes > 0 ? Math.min(100, (metrics.despesaMes / metrics.receitaMes) * 100) : 100;

  return (
    <section className="page finance-page">
      <div className="section-head row-between">
        <div>
          <h2 className="title-with-icon"><span className="title-icon" aria-hidden><UiIcon id="financeiro" /></span>Financeiro</h2>
          <p className="page-text">Resumo rapido com foco nas informacoes criticas.</p>
        </div>
        <div className="finance-actions">
          <button type="button" className="primary-btn finance-main-btn" onClick={() => setShowTxModal(true)}>
            <span className="finance-btn-icon" aria-hidden><FinanceIcon id="plus" /></span>
            Novo lancamento
          </button>
          <button type="button" className="ghost-btn finance-main-btn" onClick={() => setShowSetupModal(true)}>
            <span className="finance-btn-icon" aria-hidden><FinanceIcon id="settings" /></span>
            Categorias e contas
          </button>
          <button type="button" className="ghost-btn finance-main-btn" onClick={() => void refresh()} disabled={loading || saving}>
            <span className="finance-btn-icon" aria-hidden><FinanceIcon id="refresh" /></span>
            Atualizar painel
          </button>
        </div>
      </div>

      <div className="finance-kpi-grid">
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="wallet" /></span><span>Saldo atual</span></p><strong>{money(metrics.saldoAtual)}</strong></article>
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="up" /></span><span>Receita do mes</span></p><strong>{money(metrics.receitaMes)}</strong></article>
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="down" /></span><span>Despesas do mes</span></p><strong>{money(metrics.despesaMes)}</strong></article>
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="result" /></span><span>Resultado do mes</span></p><strong>{money(metrics.resultadoMes)}</strong></article>
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="alert" /></span><span>Vencidos</span></p><strong>{metrics.vencidos.length}</strong><span>{money(metrics.vencidos.reduce((a, b) => a + b.amount, 0))}</span></article>
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="clock" /></span><span>Vencendo (7 dias)</span></p><strong>{metrics.vencendo.length}</strong><span>{money(metrics.vencendo.reduce((a, b) => a + b.amount, 0))}</span></article>
        <article className="kpi-card"><p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="calendar" /></span><span>Futuros</span></p><strong>{metrics.futuros.length}</strong><span>{money(metrics.futuros.reduce((a, b) => a + b.amount, 0))}</span></article>
        <article className="kpi-card">
          <p className="finance-kpi-title"><span className="finance-kpi-icon" aria-hidden><FinanceIcon id="pulse" /></span><span>Saude financeira</span></p>
          <strong>{metrics.score}/100</strong>
          <span>{metrics.healthLabel}</span>
          <div className="finance-health-meter" role="img" aria-label={`Saude financeira ${metrics.score} de 100`}>
            <div
              className={`finance-health-meter-fill tone-${metrics.score >= 80 ? "good" : metrics.score >= 60 ? "warn" : "bad"}`}
              style={{ width: `${metrics.score}%` }}
            />
          </div>
        </article>
      </div>

      <div className="finance-card-grid">
        <div className="soft-panel">
          <p className="finance-panel-title"><span className="finance-panel-icon" aria-hidden><FinanceIcon id="chart" /></span>Resumo operacional</p>
          <div className="finance-stats-stack">
            <div><span>Saldo projetado</span><strong>{money(metrics.saldoProjetado)}</strong></div>
            <div><span>Pendencias vencidas</span><strong>{metrics.vencidos.length}</strong></div>
            <div><span>Contas cadastradas</span><strong>{accounts.length}</strong></div>
            <div><span>Categorias ativas</span><strong>{categories.length}</strong></div>
          </div>
          <div className="finance-status-bars">
            <div className="finance-status-row">
              <div className="finance-status-head">
                <span>Vencidos</span>
                <strong>{overduePct.toFixed(0)}%</strong>
              </div>
              <div className="finance-status-track"><div className="finance-status-fill is-bad" style={{ width: `${overduePct}%` }} /></div>
            </div>
            <div className="finance-status-row">
              <div className="finance-status-head">
                <span>Vencendo em 7 dias</span>
                <strong>{dueSoonPct.toFixed(0)}%</strong>
              </div>
              <div className="finance-status-track"><div className="finance-status-fill is-warn" style={{ width: `${dueSoonPct}%` }} /></div>
            </div>
            <div className="finance-status-row">
              <div className="finance-status-head">
                <span>Despesa x Receita</span>
                <strong>{expenseVsIncomePct.toFixed(0)}%</strong>
              </div>
              <div className="finance-status-track"><div className="finance-status-fill is-good" style={{ width: `${expenseVsIncomePct}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="soft-panel">
          <p className="finance-panel-title"><span className="finance-panel-icon" aria-hidden><FinanceIcon id="list" /></span>Proximos vencimentos</p>
          <div className="finance-mini-list">
            {upcomingPreview.length === 0 ? (
              <p className="page-text">Sem titulos pendentes.</p>
            ) : upcomingPreview.map((row) => (
              <article key={row.id} className="finance-mini-row">
                <strong>{row.description}</strong>
                <span>{new Date(`${row.due_date}T00:00:00`).toLocaleDateString("pt-BR")} - {money(row.amount)}</span>
              </article>
            ))}
          </div>
          <button type="button" className="ghost-btn finance-inline-btn" onClick={() => setShowPendingModal(true)}>Ver lista completa</button>
        </div>

        <div className="soft-panel">
          <p className="finance-panel-title"><span className="finance-panel-icon" aria-hidden><FinanceIcon id="bank" /></span>Saldos por conta</p>
          <div className="finance-mini-list">
            {accounts.length === 0 ? (
              <p className="page-text">Sem contas cadastradas.</p>
            ) : accounts.slice(0, 6).map((account) => (
              <article key={account.id} className="finance-mini-row">
                <strong>{account.name}</strong>
                <span>{money(Number(account.current_balance) || 0)}</span>
              </article>
            ))}
          </div>
          <button type="button" className="ghost-btn finance-inline-btn" onClick={() => setShowAccountsModal(true)}>Ver detalhes</button>
        </div>

        <div className="soft-panel">
          <p className="finance-panel-title"><span className="finance-panel-icon" aria-hidden><FinanceIcon id="category" /></span>Despesas por categoria</p>
          <div className="finance-mini-list">
            {expenseByCategory.length === 0 ? (
              <p className="page-text">Sem despesas pagas no mes.</p>
            ) : expenseByCategory.slice(0, 6).map((row) => (
              <article key={row.categoryId} className="finance-mini-row">
                <strong>{row.name}</strong>
                <span>{money(row.total)}</span>
              </article>
            ))}
          </div>
          <button type="button" className="ghost-btn finance-inline-btn" onClick={() => setShowCategoryHealthModal(true)}>Ver saude por categoria</button>
        </div>
      </div>

      {loading && <p className="page-text">Carregando financeiro...</p>}
      {status && <p className="page-text">{status}</p>}
      {error && <p className="error-text">{error}</p>}

      {showTxModal && (
        <div className="modal-backdrop" onClick={closeTxModal}>
          <div className="product-modal finance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Novo lancamento</h3>
              <button type="button" onClick={closeTxModal}>Fechar</button>
            </div>
            <form className="finance-form finance-form-polished" onSubmit={(e) => void createTransaction(e)}>
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="result" /></span>Tipo</span><select value={entryType} onChange={(e) => setEntryType(e.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="pulse" /></span>Status</span><select value={entryStatus} onChange={(e) => setEntryStatus(e.target.value as "pending" | "paid")}><option value="pending">Pendente</option><option value="paid">Pago</option></select></label>
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="list" /></span>Descricao</span><input value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} placeholder="Ex: Compra de papel" /></label>
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="wallet" /></span>Valor</span><input value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} placeholder="0,00" /></label>
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="calendar" /></span>Vencimento</span><input type="date" value={entryDueDate} onChange={(e) => setEntryDueDate(e.target.value)} /></label>
              {entryStatus === "paid" && (
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="calendar" /></span>Data pagamento</span><input type="date" value={entryPaidDate} onChange={(e) => setEntryPaidDate(e.target.value)} /></label>
              )}
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="category" /></span>Categoria</span>
                <select value={entryCategoryId} onChange={(e) => setEntryCategoryId(e.target.value)}>
                  <option value="">Sem categoria</option>
                  {(entryType === "expense" ? expenseCategories : incomeCategories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="bank" /></span>Conta</span>
                <select value={entryAccountId} onChange={(e) => setEntryAccountId(e.target.value)}>
                  <option value="">Sem conta</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              {entryType === "expense" && (
                <div className="finance-upload-grid">
                  <label className="field">
                    <span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="file" /></span>Foto do cupom fiscal (opcional)</span>
                    <input type="file" accept="image/*" onChange={(e) => onPickFiscalFile("receipt", e.target.files?.[0] || null)} />
                    {entryReceiptFile && (
                      <span className="finance-upload-file">
                        {entryReceiptFile.name}
                        <button type="button" className="ghost-btn" onClick={() => setEntryReceiptFile(null)}>Remover</button>
                      </span>
                    )}
                  </label>
                  <label className="field">
                    <span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="file" /></span>Foto da nota fiscal (opcional)</span>
                    <input type="file" accept="image/*" onChange={(e) => onPickFiscalFile("invoice", e.target.files?.[0] || null)} />
                    {entryInvoiceFile && (
                      <span className="finance-upload-file">
                        {entryInvoiceFile.name}
                        <button type="button" className="ghost-btn" onClick={() => setEntryInvoiceFile(null)}>Remover</button>
                      </span>
                    )}
                  </label>
                </div>
              )}
              <button type="submit" className="primary-btn finance-main-btn" disabled={saving}>{saving ? "Salvando..." : "Salvar lancamento"}</button>
            </form>
          </div>
        </div>
      )}

      {showSetupModal && (
        <div className="modal-backdrop" onClick={() => setShowSetupModal(false)}>
          <div className="product-modal finance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Cadastro rapido</h3>
              <button type="button" onClick={() => setShowSetupModal(false)}>Fechar</button>
            </div>
            <div className="finance-grid-2">
              <form className="finance-form finance-form-polished" onSubmit={(e) => void createCategory(e)}>
                <p className="finance-form-title"><span className="finance-field-icon" aria-hidden><FinanceIcon id="category" /></span>Nova categoria</p>
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="list" /></span>Nome</span><input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ex: Saude" /></label>
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="result" /></span>Tipo</span><select value={newCategoryKind} onChange={(e) => setNewCategoryKind(e.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="wallet" /></span>Orcamento mensal</span><input value={newCategoryBudget} onChange={(e) => setNewCategoryBudget(e.target.value)} placeholder="0,00" /></label>
                <button type="submit" className="ghost-btn finance-main-btn" disabled={saving}>{saving ? "Salvando..." : "Criar categoria"}</button>
                <div className="finance-mini-list">
                  {categories.length === 0 ? (
                    <p className="page-text">Sem categorias cadastradas.</p>
                  ) : categories.map((cat) => (
                    <article key={cat.id} className="finance-mini-row">
                      <strong>{cat.name}</strong>
                      <span>{cat.kind === "expense" ? "Despesa" : "Receita"}</span>
                      <button
                        type="button"
                        className="ghost-btn finance-inline-btn"
                        disabled={saving}
                        onClick={() => void deleteCategory(cat.id)}
                      >
                        Excluir categoria
                      </button>
                    </article>
                  ))}
                </div>
              </form>
              <form className="finance-form finance-form-polished" onSubmit={(e) => void createAccount(e)}>
                <p className="finance-form-title"><span className="finance-field-icon" aria-hidden><FinanceIcon id="bank" /></span>Nova conta</p>
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="list" /></span>Nome</span><input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Ex: Nubank PJ" /></label>
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="bank" /></span>Banco</span><input value={newAccountBank} onChange={(e) => setNewAccountBank(e.target.value)} placeholder="Opcional" /></label>
                <label className="field"><span className="finance-field-label"><span className="finance-field-icon" aria-hidden><FinanceIcon id="wallet" /></span>Saldo inicial</span><input value={newAccountBalance} onChange={(e) => setNewAccountBalance(e.target.value)} placeholder="0,00" /></label>
                <button type="submit" className="ghost-btn finance-main-btn" disabled={saving}>{saving ? "Salvando..." : "Criar conta"}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showPendingModal && (
        <div className="modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="product-modal finance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Contas a pagar e receber</h3>
              <button type="button" onClick={() => setShowPendingModal(false)}>Fechar</button>
            </div>
            <div className="table-wrap">
              <table className="table clean">
                <thead><tr><th>Vencimento</th><th>Descricao</th><th>Tipo</th><th>Status</th><th>Valor</th></tr></thead>
                <tbody>
                  {upcomingRows.length === 0 ? (
                    <tr><td colSpan={5}>Sem titulos pendentes.</td></tr>
                  ) : upcomingRows.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(`${row.due_date}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                      <td>{row.description}</td>
                      <td>{row.entry_type === "income" ? "Receita" : "Despesa"}</td>
                      <td>{row.status === "paid" ? "Pago" : "Pendente"}</td>
                      <td>{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAccountsModal && (
        <div className="modal-backdrop" onClick={() => setShowAccountsModal(false)}>
          <div className="product-modal finance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Saldos por conta</h3>
              <button type="button" onClick={() => setShowAccountsModal(false)}>Fechar</button>
            </div>
            <div className="table-wrap">
              <table className="table clean">
                <thead><tr><th>Conta</th><th>Banco</th><th>Saldo</th></tr></thead>
                <tbody>
                  {accounts.length === 0 ? (
                    <tr><td colSpan={3}>Sem contas cadastradas.</td></tr>
                  ) : accounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td>{account.bank || "-"}</td>
                      <td>{money(Number(account.current_balance) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showCategoryHealthModal && (
        <div className="modal-backdrop" onClick={() => setShowCategoryHealthModal(false)}>
          <div className="product-modal finance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-head">
              <h3>Saude por categoria</h3>
              <button type="button" onClick={() => setShowCategoryHealthModal(false)}>Fechar</button>
            </div>
            <div className="table-wrap">
              <table className="table clean">
                <thead><tr><th>Categoria</th><th>Despesa mes</th><th>Orcamento</th><th>Saude</th></tr></thead>
                <tbody>
                  {expenseByCategory.length === 0 ? (
                    <tr><td colSpan={4}>Sem despesas pagas no mes.</td></tr>
                  ) : expenseByCategory.map((row) => (
                    <tr key={row.categoryId}>
                      <td>{row.name}</td>
                      <td>{money(row.total)}</td>
                      <td>{row.budget > 0 ? money(row.budget) : "-"}</td>
                      <td>
                        {row.healthPct == null ? "Sem meta" : row.healthPct <= 70 ? `Saudavel (${row.healthPct.toFixed(0)}%)` : row.healthPct <= 100 ? `Atencao (${row.healthPct.toFixed(0)}%)` : `Critico (${row.healthPct.toFixed(0)}%)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

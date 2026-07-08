import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loginUser } from "./db-actions";

interface CustomUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  associacao_uniao?: string;
  primeiro_acesso: boolean;
}

interface AuthCtx {
  user: CustomUser | null;
  loading: boolean;
  signIn: (login_ou_email: string, senha_pura: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restaurar sessão local
    const savedUser = localStorage.getItem("plurall_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const signIn: AuthCtx["signIn"] = async (login_ou_email, senha_pura) => {
    try {
      const rawRes = await loginUser({ data: { login_ou_email, senha_pura } });
      console.log("Response from loginUser:", rawRes);
      
      const res = (rawRes as any)?.data !== undefined ? (rawRes as any).data : rawRes;
      
      if (res && res.success && res.user) {
        setUser(res.user);
        localStorage.setItem("plurall_user", JSON.stringify(res.user));
        return {};
      }
      
      const errorMsg = res?.error || (rawRes as any)?.error || "Erro no login.";
      return { error: errorMsg };
    } catch (err: any) {
      console.error("Erro no signIn:", err);
      return { error: err.message || "Erro de conexão com o servidor." };
    }
  };

  const signUp: AuthCtx["signUp"] = async (email, password, fullName) => {
    // Implementar lógica de signup via MySQL se necessário depois
    return { error: "Criação de conta desabilitada temporariamente. Peça a um administrador." };
  };

  const signOut = async () => { 
    setUser(null);
    localStorage.removeItem("plurall_user");
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

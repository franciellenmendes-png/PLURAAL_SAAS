import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import iconDado from "../../img/ICON DADO.png";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updatePassword, sendPasswordResetCode, resetPasswordWithCode } from "@/lib/db-actions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type FlowState = "LOGIN" | "PRIMEIRO_ACESSO" | "ESQUECI_SENHA_PEDIR" | "ESQUECI_SENHA_CODIGO";

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<FlowState>("LOGIN");
  const [tempUserId, setTempUserId] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    // Se logar e não for primeiro acesso, vai pro dashboard
    if (!loading && user && !user.primeiro_acesso) {
      navigate({ to: "/dashboard", replace: true });
    } else if (!loading && user && user.primeiro_acesso) {
      setTempUserId(user.id);
      setFlow("PRIMEIRO_ACESSO");
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const loginOuEmail = fd.get("login_ou_email") as string;
    const password = fd.get("password") as string;
    
    if (!loginOuEmail || password.length < 5) return toast.error("Preencha corretamente os campos.");

    setBusy(true);
    const res = await signIn(loginOuEmail, password);
    setBusy(false);
    
    if (res.error) {
      toast.error(res.error);
    }
  };

  const handlePrimeiroAcesso = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tempUserId) return;
    const fd = new FormData(e.currentTarget);
    const p1 = fd.get("p1") as string;
    const p2 = fd.get("p2") as string;

    if (p1.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");
    if (p1 !== p2) return toast.error("As senhas não coincidem.");

    setBusy(true);
    const res = await updatePassword({ data: { userId: tempUserId, novaSenhaPura: p1 } });
    setBusy(false);

    if (res.success) {
      toast.success("Senha atualizada! Redirecionando...");
      window.location.href = "/dashboard";
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="grid min-h-screen overflow-x-hidden lg:grid-cols-2">
      {/* Painel esquerdo */}
      <div className="relative hidden overflow-hidden bg-gradient-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 70%, white 0, transparent 35%)",
        }} />
        <div className="relative flex items-center gap-4 text-primary-foreground">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden transition-transform hover:scale-105">
            <img src={iconDado} alt="Logo" className="h-full w-full object-contain" />
          </div>
          <span className="font-display text-4xl font-black tracking-tighter text-white">BI Hub</span>
        </div>
        <div className="relative space-y-4 text-primary-foreground">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Inteligência de dados para cada Associação.
          </h1>
          <p className="max-w-md text-base text-primary-foreground/80">
            Acesse os painéis Power BI de todas as suas associações em um único lugar — moderno, seguro e sempre disponível.
          </p>
        </div>
        <div className="relative text-xs text-primary-foreground/60">© {new Date().getFullYear()} BI Hub</div>
      </div>

      {/* Formulário (Lado Direito) */}
      <div className="flex items-center justify-center bg-background px-4 py-8 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden">
              <img src={iconDado} alt="Logo" className="h-full w-full object-contain" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight mt-2">BI Hub</span>
          </div>

          {/* FLUXO: LOGIN NORMAL */}
          {flow === "LOGIN" && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <h2 className="font-display text-2xl font-semibold">Bem-vindo de volta</h2>
              <p className="mt-1 text-sm text-muted-foreground mb-6">Entre com seu login ou email para acessar.</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Login ou Email</Label>
                  <Input id="login-email" name="login_ou_email" type="text" required />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="login-password">Senha</Label>
                    <button 
                      type="button" 
                      onClick={() => toast.info("Por favor, entre em contato com o administrador para redefinir sua senha.", { duration: 5000 })}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <Input id="login-password" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full bg-gradient-primary shadow-elegant mt-2" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar no Sistema"}
                </Button>
              </form>
            </div>
          )}

          {/* FLUXO: PRIMEIRO ACESSO */}
          {flow === "PRIMEIRO_ACESSO" && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <h2 className="font-display text-2xl font-semibold text-primary">Primeiro Acesso</h2>
              <p className="mt-1 text-sm text-muted-foreground mb-6">
                Para sua segurança, defina uma nova senha definitiva antes de continuar.
              </p>

              <form onSubmit={handlePrimeiroAcesso} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="p1">Nova Senha</Label>
                  <Input id="p1" name="p1" type="password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p2">Confirme a Nova Senha</Label>
                  <Input id="p2" name="p2" type="password" required />
                </div>
                <Button type="submit" className="w-full bg-gradient-primary shadow-elegant mt-2" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Senha e Entrar"}
                </Button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

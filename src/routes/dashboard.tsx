import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BarChart3, Loader2, Search, Sparkles, Filter, LayoutGrid } from "lucide-react";
import iconDado from "../../img/ICON DADO.png";
import { useAuth } from "@/lib/auth";
import { getDashboardLinks } from "@/lib/db-actions";
import { MainLayout } from "@/components/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const { data: associations, isLoading } = useQuery({
    queryKey: ["dashboard-links", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await getDashboardLinks({ data: { userId: user!.id, role: user!.role } });
      if (!res.success) throw new Error(res.error);
      return res.links;
    },
  });

  const filtered = useMemo(() => {
    if (!associations) return [];
    const t = q.trim().toLowerCase();
    if (!t) return associations;
    return associations.filter((a: any) => a.name.toLowerCase().includes(t));
  }, [associations, q]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Carregando seus painéis...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <main className="w-full">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-sm">
              <Sparkles className="h-3 w-3" />
              Central de Inteligência
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              Painéis das <span className="text-gradient">Associações</span>
            </h1>
            <p className="max-w-2xl text-sm sm:text-base text-muted-foreground">
              Acesse em tempo real os indicadores e relatórios das suas associações vinculadas.
            </p>
          </div>
          <div className="relative w-full lg:max-w-md group">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar por associação ou relatório..."
              className="h-12 pl-12 bg-white/50 backdrop-blur-md border-border/40 focus:border-primary/40 transition-all shadow-sm focus:shadow-xl rounded-2xl text-base"
            />
          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 rounded-3xl bg-muted/20 animate-pulse border border-border/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/60 bg-white/30 p-8 text-center backdrop-blur-sm sm:p-16 lg:rounded-[2.5rem] lg:p-24">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-muted/20 text-muted-foreground/40">
                <BarChart3 className="h-10 w-10" />
              </div>
              <h2 className="mt-6 text-xl font-bold">Nenhum painel encontrado</h2>
              <p className="mt-2 text-muted-foreground max-w-sm mx-auto">
                {q ? "Não encontramos resultados para sua busca." : "Solicite ao administrador o vínculo às associações que deseja acessar."}
              </p>
              {!q && (
                <Button asChild variant="outline" className="mt-8 rounded-xl">
                  <Link to="/admin">Ir para Administração</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((a: any) => (
                <Link
                  key={a.id}
                  to="/bi/$slug"
                  params={{ slug: a.id }}
                  className="group relative overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-5 backdrop-blur-xl shadow-elegant transition-all duration-500 hover:-translate-y-2 hover:border-primary/20 hover:bg-white/80 hover:shadow-glow sm:p-7"
                >
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/5 blur-3xl transition-all duration-700 group-hover:bg-primary/20 group-hover:scale-150" />
                  
                  <div className="relative flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow transition-all duration-500 group-hover:scale-110 group-hover:rotate-3">
                      <BarChart3 className="h-7 w-7" />
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:bg-primary/10 translate-x-4 group-hover:translate-x-0">
                      <ArrowUpRight className="h-5 w-5 text-primary" />
                    </div>
                  </div>

                  <div className="relative mt-10">
                    <h3 className="font-display text-xl font-black text-foreground/90 group-hover:text-primary transition-colors leading-tight">
                      {a.name}
                    </h3>
                    {a.descricao && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">
                        {a.descricao}
                      </p>
                    )}
                    <div className="mt-6 flex items-center gap-2">
                      <div className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                        Ativo • Power BI
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </MainLayout>
  );
}

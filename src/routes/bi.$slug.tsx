import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Maximize2, LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getLinkBySlug } from "@/lib/db-actions";
import { MainLayout } from "@/components/MainLayout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/bi/$slug")({
  component: BiPage,
});

function BiPage() {
  const { slug } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const { data: res, isLoading, error } = useQuery({
    queryKey: ["association", slug, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await getLinkBySlug({ data: slug });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const data = res;

  const openFullscreen = () => {
    const iframe = document.getElementById("bi-frame") as HTMLIFrameElement | null;
    iframe?.requestFullscreen?.();
  };

  return (
    <MainLayout>
      <main className="flex w-full min-w-0 flex-1 flex-col -mt-2 sm:-mt-4">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Button asChild variant="ghost" size="sm" className="rounded-xl hover:bg-white/60">
              <Link to="/dashboard" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="font-bold text-xs">Voltar</span>
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="break-words font-display text-lg font-black leading-tight tracking-tight text-foreground/90 sm:text-xl">
                {data?.name ?? (isLoading ? "Carregando..." : "Painel")}
              </h1>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Relatório ao vivo • Power BI</p>
              </div>
            </div>
          </div>
          {data && (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" size="sm" onClick={openFullscreen} className="h-9 rounded-lg border-border/40 px-3 text-xs font-bold transition-all hover:bg-primary/5 hover:text-primary">
                <Maximize2 className="h-3 w-3 mr-2" />Tela cheia
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 rounded-lg border-border/40 px-3 text-xs font-bold transition-all hover:bg-primary/5 hover:text-primary">
                <a href={data.bi_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-2" />Abrir original
                </a>
              </Button>
            </div>
          )}
        </div>

        <div className="relative min-h-[62vh] flex-1 overflow-hidden rounded-2xl border border-border/40 bg-white shadow-elegant sm:min-h-[calc(100vh-220px)] md:min-h-[calc(100vh-180px)]">
          {isLoading ? (
            <div className="flex h-full items-center justify-center py-40">
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex h-16 w-16">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20 opacity-75"></span>
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Estabelecendo conexão...</p>
              </div>
            </div>
          ) : !data ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-40 text-center">
              <div className="h-20 w-20 flex items-center justify-center rounded-[2rem] bg-white/60 shadow-inner">
                <LayoutGrid className="h-10 w-10 text-primary/20" />
              </div>
              <div>
                <p className="text-xl font-black text-foreground/90">Painel indisponível</p>
                <p className="max-w-xs text-sm font-medium text-muted-foreground mt-1">
                  {error ? "Houve um problema ao carregar os dados." : "Este link não foi encontrado ou você não tem permissão para acessá-lo."}
                </p>
              </div>
              <Button asChild variant="outline" className="mt-4 rounded-xl font-bold h-11 px-6 border-border/40 hover:bg-primary/5 hover:text-primary">
                <Link to="/dashboard">Explorar outros painéis</Link>
              </Button>
            </div>
          ) : (
            <iframe
              id="bi-frame"
              title={data.name}
              src={data.bi_url}
              className="absolute inset-0 w-full h-full border-0 rounded-2xl"
              allowFullScreen
            />
          )}
        </div>
      </main>
    </MainLayout>
  );
}

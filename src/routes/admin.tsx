import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Shield, ShieldCheck, User as UserIcon, RefreshCw, BarChart3, Trash2, Edit3, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { MainLayout } from "@/components/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { syncDatabase, resetUserPassword, getAdminUsers, getAdminLinks, getUserPermissions, toggleUserLink, toggleUserAdmin, createAdminUser, createAdminLink, deleteAdminLink, updateAdminLink } from "@/lib/db-actions";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Profile = { id: string; email: string; full_name: string; role: string };
type Assoc = { id: string; name: string; url: string; descricao?: string };

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login", replace: true });
  }, [user, authLoading, navigate]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncDatabase();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error("Erro ao sincronizar: " + res.error);
      }
    } catch (error: any) {
      toast.error("Falha ao sincronizar: " + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const res = await getAdminUsers();
      if (!res.success) throw new Error(res.error);
      return res.users as Profile[];
    },
  });

  const { data: associations } = useQuery({
    queryKey: ["admin-associations"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const res = await getAdminLinks();
      if (!res.success) throw new Error(res.error);
      return res.links as Assoc[];
    },
  });

  const { data: links, refetch: refetchLinks } = useQuery({
    queryKey: ["admin-links", selectedUserId],
    enabled: !!isAdmin && !!selectedUserId,
    queryFn: async () => {
      const res = await getUserPermissions({ data: selectedUserId! });
      if (!res.success) throw new Error(res.error);
      return new Set<string>(res.links);
    },
  });

  const filtered = useMemo(() => {
    if (!users) return [];
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter(
      (u) => (u.email ?? "").toLowerCase().includes(t) || (u.full_name ?? "").toLowerCase().includes(t),
    );
  }, [users, q]);

  const isUserAdmin = (uid: string) => users?.some((r) => {
    const rRole = (r.role || "").toLowerCase();
    return r.id === uid && (rRole === "admin" || rRole === "admin2");
  }) ?? false;

  const toggleAssociation = async (associationId: string, checked: boolean) => {
    if (!selectedUserId) return;
    const res = await toggleUserLink({ data: { userId: selectedUserId, linkId: associationId, checked } });
    if (!res.success) return toast.error(res.error);
    refetchLinks();
  };

  const toggleAdmin = async (uid: string, makeAdmin: boolean) => {
    const res = await toggleUserAdmin({ data: { userId: uid, isAdmin: makeAdmin } });
    if (!res.success) return toast.error(res.error);
    toast.success(makeAdmin ? "Promovido a admin" : "Permissão de admin removida");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const [activeTab, setActiveTab] = useState<"users" | "links">("users");
  const [showNewUser, setShowNewUser] = useState(false);
  const [showNewLink, setShowNewLink] = useState(false);

  // Formulário Novo Usuário
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("coordenacao");
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUser(true);
    const res = await createAdminUser({ data: { nome: newUserName, email: newUserEmail, nivel: newUserRole } });
    setIsSubmittingUser(false);
    if (!res.success) return toast.error(res.error);
    toast.success("Usuário criado com sucesso! Senha padrão: MUDAR@123");
    setShowNewUser(false);
    setNewUserName("");
    setNewUserEmail("");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  // Formulário Link
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkDesc, setNewLinkDesc] = useState("");
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLink(true);
    const res = await createAdminLink({ data: { titulo: newLinkTitle, url: newLinkUrl, descricao: newLinkDesc } });
    setIsSubmittingLink(false);
    if (!res.success) return toast.error(res.error);
    toast.success("Link cadastrado com sucesso!");
    setShowNewLink(false);
    setNewLinkTitle("");
    setNewLinkUrl("");
    setNewLinkDesc("");
    qc.invalidateQueries({ queryKey: ["admin-associations"] });
  };

  const handleUpdateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLinkId) return;
    setIsSubmittingLink(true);
    const res = await updateAdminLink({ 
      data: { id: selectedLinkId, titulo: newLinkTitle, url: newLinkUrl, descricao: newLinkDesc } 
    });
    setIsSubmittingLink(false);
    if (!res.success) return toast.error(res.error);
    toast.success("Link atualizado!");
    qc.invalidateQueries({ queryKey: ["admin-associations"] });
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este link? Isso irá apagar as permissões associadas também.")) return;
    const res = await deleteAdminLink({ data: id });
    if (!res.success) return toast.error(res.error);
    toast.success("Link removido!");
    if (selectedLinkId === id) setSelectedLinkId(null);
    qc.invalidateQueries({ queryKey: ["admin-associations"] });
  };

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <main className="mx-auto max-w-md px-6 py-20 text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é exclusiva para administradores.
          </p>
          <Button asChild className="mt-6" variant="outline">
            <Link to="/dashboard">Voltar aos painéis</Link>
          </Button>
        </main>
      </MainLayout>
    );
  }

  const selectedUser = users?.find((u) => u.id === selectedUserId);
  const selectedLink = associations?.find((a) => a.id === selectedLinkId);

  return (
    <MainLayout>
      <main className="w-full min-w-0 py-4 sm:py-6 lg:py-8">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Gestão de Infraestrutura
            </div>
            <h1 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Painel de Controle</h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">
              Gerencie a segurança, os usuários e a biblioteca de relatórios BI do ecossistema.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button 
              variant="outline"
              size="lg"
              className="w-full rounded-2xl border-primary/20 shadow-sm transition-all hover:bg-primary/5 hover:text-primary sm:w-auto"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {isSyncing ? "Sincronizando..." : "Sincronizar Bancos"}
            </Button>
            <div className="grid grid-cols-2 rounded-2xl border border-white/60 bg-white/40 p-1 shadow-elegant backdrop-blur-sm sm:flex">
              <Button 
                variant={activeTab === "users" ? "default" : "ghost"} 
                className={`rounded-xl transition-all ${activeTab === "users" ? "shadow-glow" : ""}`}
                onClick={() => { setActiveTab("users"); setShowNewUser(false); }}
              >
                Usuários
              </Button>
              <Button 
                variant={activeTab === "links" ? "default" : "ghost"} 
                className={`rounded-xl transition-all ${activeTab === "links" ? "shadow-glow" : ""}`}
                onClick={() => { setActiveTab("links"); setShowNewLink(false); }}
              >
                Links BI
              </Button>
            </div>
          </div>
        </div>

        {activeTab === "users" && (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <section className="flex max-h-[46vh] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-elegant backdrop-blur-md sm:max-h-[55vh] xl:h-[70vh] xl:max-h-none xl:rounded-[2.5rem]">
              <div className="p-6 border-b border-border/40 space-y-4">
                <Button onClick={() => setShowNewUser(true)} className="w-full h-12 rounded-2xl bg-gradient-primary shadow-glow hover:scale-[1.02] transition-transform">
                  + Novo Usuário
                </Button>
                <div className="relative group">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filtrar por nome ou email..."
                    className="h-11 pl-12 bg-white/50 border-border/40 focus:border-primary/40 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {!users ? (
                  <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary/40" /></div>
                ) : filtered.length === 0 ? (
                  <div className="py-20 text-center space-y-2 opacity-60">
                    <UserIcon className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium">Nenhum usuário encontrado</p>
                  </div>
                ) : (
                  filtered.map((u) => {
                    const active = u.id === selectedUserId && !showNewUser;
                    const admin = isUserAdmin(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUserId(u.id); setShowNewUser(false); }}
                        className={`group flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all duration-300 ${
                          active ? "bg-white shadow-md ring-1 ring-primary/10" : "hover:bg-white/40"
                        }`}
                      >
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-transform group-hover:scale-110 ${active ? "bg-gradient-primary text-white" : "bg-white/80 text-primary/60"}`}>
                          <UserIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${active ? "text-primary" : "text-foreground/90"}`}>{u.full_name || "Sem nome"}</p>
                          <p className="truncate text-xs text-muted-foreground/80 font-medium">{u.email}</p>
                        </div>
                        {admin && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] bg-primary/10 text-primary border-none font-bold uppercase tracking-widest">admin</Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="relative min-h-[65vh] overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-elegant backdrop-blur-md xl:h-[70vh] xl:rounded-[2.5rem]">
              {showNewUser ? (
                <div className="flex h-full flex-col p-5 sm:p-8">
                  <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
                    <h2 className="font-display text-xl font-black tracking-tight text-foreground/90 sm:text-2xl">Criar Novo Integrante</h2>
                    <Button variant="ghost" size="icon" onClick={() => setShowNewUser(false)} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <form className="flex-1 space-y-6 overflow-y-auto pr-1 sm:pr-4" onSubmit={handleCreateUser}>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/70 ml-1">Nome Completo</label>
                        <Input placeholder="Ex: João Silva" className="h-12 rounded-xl bg-white/50" value={newUserName} onChange={e => setNewUserName(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/70 ml-1">E-mail Corporativo</label>
                        <Input type="email" placeholder="joao@exemplo.com" className="h-12 rounded-xl bg-white/50" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground/70 ml-1">Nível de Privilégio</label>
                      <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} className="w-full flex h-12 items-center justify-between rounded-xl border border-input bg-white/50 px-4 text-sm ring-offset-background transition-all focus:outline-none focus:ring-2 focus:ring-primary/20">
                        <option value="coordenacao">Coordenação (Acesso restrito)</option>
                        <option value="admin">Administrador Geral</option>
                        <option value="admin2">Admin 2 (Visualização total)</option>
                      </select>
                    </div>
                    <div className="pt-4">
                      <Button type="submit" className="w-full h-14 rounded-2xl bg-gradient-primary shadow-glow font-bold text-lg hover:scale-[1.01] transition-transform" disabled={isSubmittingUser}>
                        {isSubmittingUser ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Efetivar Cadastro"}
                      </Button>
                      <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                        A senha temporária será definida como <span className="text-primary font-black">MUDAR@123</span>
                      </p>
                    </div>
                  </form>
                </div>
              ) : !selectedUser ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white/60 shadow-inner">
                    <UserIcon className="h-10 w-10 text-primary/30" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xl font-bold">Gestão de Identidades</p>
                    <p className="max-w-xs text-sm text-muted-foreground font-medium leading-relaxed">
                      Selecione um colaborador na lista ao lado para ajustar permissões ou resetar credenciais.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex flex-col justify-between gap-5 border-b border-border/40 bg-white/20 p-5 sm:p-8 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-primary text-white shadow-glow sm:h-16 sm:w-16">
                        <UserIcon className="h-8 w-8" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="break-words font-display text-xl font-black tracking-tight text-foreground/90 sm:text-2xl">{selectedUser.full_name || "Sem nome"}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="bg-white/50 text-[10px] font-bold py-0">{selectedUser.role}</Badge>
                          <p className="text-xs text-muted-foreground font-medium">{selectedUser.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button 
                        variant="outline" 
                        className="rounded-xl border-destructive/20 hover:bg-destructive/10 hover:text-destructive h-11"
                        onClick={async () => {
                          if (confirm(`Tem certeza que deseja resetar a senha de ${selectedUser.full_name}?`)) {
                            const res = await resetUserPassword({ data: selectedUser.id });
                            if (res.success) toast.success(res.message);
                            else toast.error(res.error);
                          }
                        }}
                      >
                        Resetar Credenciais
                      </Button>
                      <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-white/60 px-4 h-11 shadow-sm">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Privilégio Admin</span>
                        <Switch
                          checked={isUserAdmin(selectedUser.id)}
                          disabled={selectedUser.id === user?.id}
                          onCheckedChange={(c) => toggleAdmin(selectedUser.id, c)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 sm:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-lg">Biblioteca de Relatórios Vinculados</h3>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      {!associations ? (
                        <div className="col-span-full py-10 flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Carregando Biblioteca...</p>
                        </div>
                      ) : associations.length === 0 ? (
                        <div className="col-span-full py-12 text-center rounded-2xl border border-dashed border-border/40">
                          <p className="text-sm text-muted-foreground font-medium">Nenhum link cadastrado no sistema.</p>
                        </div>
                      ) : (
                        associations.map(a => (
                          <label 
                            key={a.id} 
                            htmlFor={`link-${a.id}`}
                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                              links?.has(a.id) 
                                ? "bg-primary/5 border-primary/20 shadow-sm" 
                                : "bg-white/40 border-transparent hover:bg-white/60"
                            }`}
                          >
                            <Checkbox 
                              id={`link-${a.id}`} 
                              checked={links?.has(a.id) ?? false}
                              onCheckedChange={(checked) => toggleAssociation(a.id, !!checked)}
                              className="h-5 w-5 rounded-md"
                            />
                            <div className="min-w-0">
                              <p className={`text-sm font-bold truncate ${links?.has(a.id) ? "text-primary" : "text-foreground/80"}`}>{a.name}</p>
                              <p className="text-[10px] text-muted-foreground font-medium truncate uppercase tracking-tighter">{a.url}</p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "links" && (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <section className="flex max-h-[46vh] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-elegant backdrop-blur-md sm:max-h-[55vh] xl:h-[70vh] xl:max-h-none xl:rounded-[2.5rem]">
              <div className="p-6 border-b border-border/40 space-y-4">
                <Button 
                  onClick={() => {
                    setShowNewLink(true);
                    setSelectedLinkId(null);
                    setNewLinkTitle("");
                    setNewLinkUrl("");
                    setNewLinkDesc("");
                  }} 
                  className="w-full h-12 rounded-2xl bg-gradient-primary shadow-glow hover:scale-[1.02] transition-transform"
                >
                  + Novo Relatório BI
                </Button>
                <div className="relative group">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input placeholder="Pesquisar relatório..." className="h-11 pl-12 bg-white/50 border-border/40 focus:border-primary/40 rounded-xl" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {!associations ? (
                  <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary/40" /></div>
                ) : associations.length === 0 ? (
                  <div className="py-20 text-center space-y-2 opacity-60">
                    <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium">Nenhum relatório vinculado</p>
                  </div>
                ) : (
                  associations.map((a) => {
                    const active = a.id === selectedLinkId && !showNewLink;
                    return (
                      <button
                        key={a.id}
                        onClick={() => {
                          setSelectedLinkId(a.id);
                          setShowNewLink(false);
                          setNewLinkTitle(a.name);
                          setNewLinkUrl(a.url);
                          setNewLinkDesc(a.descricao || "");
                        }}
                        className={`group relative flex w-full flex-col gap-1 rounded-2xl p-4 text-left transition-all duration-300 ${
                          active ? "bg-white shadow-md ring-1 ring-primary/10" : "hover:bg-white/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-black text-sm leading-tight truncate ${active ? "text-primary" : "text-foreground/90"}`}>{a.name}</p>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 shrink-0 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-full"
                            onClick={(e) => { e.stopPropagation(); handleDeleteLink(a.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground/70 truncate uppercase tracking-wider">{a.url}</p>
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </section>

            <section className="relative min-h-[65vh] overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-elegant backdrop-blur-md xl:h-[70vh] xl:rounded-[2.5rem]">
              {(showNewLink || selectedLinkId) ? (
                <div className="flex h-full flex-col p-5 sm:p-8">
                  <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
                    <h2 className="font-display text-xl font-black tracking-tight text-foreground/90 sm:text-2xl">
                      {showNewLink ? "Vincular Novo Power BI" : "Propriedades do Relatório"}
                    </h2>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => { setShowNewLink(false); setSelectedLinkId(null); }} 
                      className="rounded-full hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <form className="flex-1 space-y-6 overflow-y-auto pr-1 sm:pr-4" onSubmit={showNewLink ? handleCreateLink : handleUpdateLink}>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground/70 ml-1">Título de Exibição</label>
                      <Input placeholder="Ex: Painel de Vendas Regional" className="h-12 rounded-xl bg-white/50" value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground/70 ml-1">Endereço (URL) Power BI</label>
                      <Input type="url" placeholder="https://app.powerbi.com/view?r=..." className="h-12 rounded-xl bg-white/50" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground/70 ml-1">Descrição do Contexto (Opcional)</label>
                      <textarea 
                        value={newLinkDesc} 
                        onChange={e => setNewLinkDesc(e.target.value)} 
                        className="w-full flex min-h-[120px] rounded-xl border border-input bg-white/50 px-4 py-3 text-sm ring-offset-background transition-all focus:outline-none focus:ring-2 focus:ring-primary/20" 
                        placeholder="Descreva a finalidade deste relatório para orientar os usuários..."
                      />
                    </div>
                    <div className="flex flex-col gap-4 pt-4 sm:flex-row">
                      <Button type="submit" className="flex-1 h-14 rounded-2xl bg-gradient-primary shadow-glow font-bold text-lg hover:scale-[1.01] transition-transform" disabled={isSubmittingLink}>
                        {isSubmittingLink ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : (showNewLink ? "Registrar Relatório" : "Atualizar Dados")}
                      </Button>
                      {!showNewLink && (
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon" 
                          className="h-14 w-14 rounded-2xl border-destructive/20 text-destructive hover:bg-destructive/5"
                          onClick={() => handleDeleteLink(selectedLinkId!)}
                        >
                          <Trash2 className="h-6 w-6" />
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[2.5rem] bg-white/60 shadow-inner">
                    <BarChart3 className="h-10 w-10 text-primary/30" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xl font-bold">Arquitetura de Dados</p>
                    <p className="max-w-xs text-sm text-muted-foreground font-medium leading-relaxed">
                      Gerencie a biblioteca de dashboards do Power BI. Crie novas conexões ou edite as existentes clicando na lista lateral.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </MainLayout>
  );
}

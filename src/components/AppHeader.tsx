import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck, Database, LayoutGrid } from "lucide-react";
import iconDado from "../../img/ICON DADO.png";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-white/60 backdrop-blur-xl">
      <div className="w-full flex h-20 items-center justify-between px-4 sm:px-8 lg:px-12">
        <Link to="/dashboard" className="flex items-center gap-4 transition-all hover:opacity-80 group">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
            <img src={iconDado} alt="Logo" className="h-full w-full object-contain" />
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-xl font-black tracking-tighter text-foreground/90 uppercase">BI Hub</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Intelligence Systems</span>
          </div>
        </Link>
        {user && (
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="flex bg-secondary/30 p-1 rounded-xl mr-2">
              <Button asChild variant="ghost" size="sm" className="h-9 px-3 rounded-lg hover:bg-white/50 text-xs font-bold uppercase tracking-wider">
                <Link to="/dashboard" className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden md:inline">Início</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-9 px-3 rounded-lg hover:bg-white/50 text-xs font-bold uppercase tracking-wider">
                <Link to="/data-management" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span className="hidden md:inline">Gerenciamento</span>
                </Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="ghost" size="sm" className="h-9 px-3 rounded-lg hover:bg-white/50 text-xs font-bold uppercase tracking-wider text-primary">
                  <Link to="/admin" className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="hidden md:inline">Admin</span>
                  </Link>
                </Button>
              )}
            </div>
            <div className="hidden lg:flex flex-col items-end mr-2">
              <span className="text-xs font-black text-foreground/80">{user.email?.split('@')[0]}</span>
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{user.role}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="h-10 px-4 rounded-xl border-border/40 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 transition-all font-bold">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { LogOut, ShieldCheck, Database, LayoutGrid, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import iconDado from "../../img/ICON DADO.png";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./MainLayout";

export function Sidebar() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollapsed, setIsCollapsed } = useSidebar();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const navItems = [
    { label: "Início", icon: LayoutGrid, href: "/dashboard" },
    { label: "Relatórios", icon: FileText, href: "/reports" },
    { label: "Gerenciamento", icon: Database, href: "/data-management" },
    { label: "Admin", icon: ShieldCheck, href: "/admin", adminOnly: true },
  ];

  const activePath = location.pathname;

  return (
    <aside 
      className={`fixed inset-x-3 bottom-3 z-50 flex h-20 flex-row rounded-3xl border border-white/40 bg-white/75 shadow-elegant backdrop-blur-2xl transition-all duration-500 md:inset-x-auto md:bottom-auto md:left-0 md:top-0 md:h-screen md:flex-col md:rounded-none md:border-r md:border-white/20 md:bg-white/40 ${
        isCollapsed ? "md:w-20" : "md:w-20 lg:w-72"
      }`}
    >
      {/* Header / Logo */}
      <div className="hidden h-24 items-center overflow-hidden px-4 md:flex">
        <Link to="/dashboard" className="flex items-center gap-4 group">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
            <img src={iconDado} alt="Logo" className="h-8 w-8 object-contain" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-tight animate-in fade-in slide-in-from-left-2 duration-500">
              <span className="font-display text-xl font-black tracking-tighter text-foreground uppercase">BI Hub</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Intelligence</span>
            </div>
          )}
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-1 items-center justify-around gap-1 px-2 py-2 md:block md:space-y-2 md:px-3 md:py-6">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const isActive = activePath === item.href;
          
          return (
            <Link
              key={item.href}
              to={item.href as any}
              className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-center transition-all duration-300 md:flex-none md:flex-row md:justify-start md:gap-4 md:p-4 md:text-left ${
                isActive 
                  ? "bg-gradient-primary text-white shadow-glow" 
                  : "text-muted-foreground hover:bg-white/60 hover:text-primary"
              }`}
            >
              <item.icon className={`h-5 w-5 shrink-0 transition-transform duration-500 ${isActive ? "" : "group-hover:scale-110"}`} />
              <span className={`${isCollapsed ? "md:hidden" : "md:hidden lg:inline"} max-w-full truncate text-[10px] font-bold tracking-tight md:text-sm md:animate-in md:fade-in md:slide-in-from-left-2 md:duration-300`}>
                  {item.label}
              </span>
              {isActive && (
                <div className="absolute -top-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary shadow-glow md:-right-3 md:left-auto md:top-1/2 md:h-8 md:w-1 md:-translate-y-1/2 md:translate-x-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Profile */}
      <div className="hidden border-t border-border/40 p-4 space-y-4 md:block">
        {user && (
          <div className={`flex items-center gap-3 p-2 rounded-2xl bg-white/40 border border-white/60 shadow-sm overflow-hidden ${isCollapsed ? "justify-center" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white font-bold text-xs shadow-sm uppercase">
              {user.email?.[0]}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0 animate-in fade-in duration-500">
                <span className="text-xs font-black text-foreground truncate">{user.email?.split('@')[0]}</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{user.role}</span>
              </div>
            )}
          </div>
        )}
        
        <Button 
          variant="ghost" 
          onClick={handleLogout}
          className={`w-full flex items-center gap-4 rounded-2xl p-4 h-12 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all group ${isCollapsed ? "justify-center px-0" : "justify-start"}`}
        >
          <LogOut className="h-5 w-5 shrink-0 transition-transform group-hover:-translate-x-1" />
          {!isCollapsed && <span className="text-sm font-bold tracking-tight">Encerrar Sessão</span>}
        </Button>

        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-24 hidden h-6 w-6 items-center justify-center rounded-full border border-border/40 bg-white shadow-sm transition-all duration-300 hover:bg-primary hover:text-white md:flex"
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>
    </aside>
  );
}

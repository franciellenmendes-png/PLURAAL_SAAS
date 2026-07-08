import { createContext, useContext, useState, ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/lib/auth";

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
}

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!user) return <>{children}</>;

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed }}>
      <div className="flex min-h-screen bg-gradient-hero">
        <Sidebar />
        <div 
          className={`min-w-0 flex-1 transition-all duration-500 ${
            isCollapsed ? "md:ml-20" : "md:ml-20 lg:ml-72"
          }`}
        >
          <div className="px-4 pb-28 pt-4 sm:px-6 sm:pt-6 md:pb-6 lg:p-10 xl:p-12">
            {children}
          </div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

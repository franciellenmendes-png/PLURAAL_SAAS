import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export function useIsAdmin() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { 
      setIsAdmin(false); 
      return; 
    }
    
    const role = (user.role || "").toLowerCase();
    setIsAdmin(role === 'admin' || role === 'admin2');
  }, [user, loading]);

  return { isAdmin, loading: loading || isAdmin === null };
}

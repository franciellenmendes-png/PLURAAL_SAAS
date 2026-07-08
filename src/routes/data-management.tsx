import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Download, FileSpreadsheet, Loader2, Table as TableIcon, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MainLayout } from "@/components/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMySQLTables, getTableData, getEscolas } from "@/lib/db-actions";
import { toast } from "sonner";

export const Route = createFileRoute("/data-management")({
  component: DataManagementPage,
});

const formatValue = (val: any, header: string, tableName: string) => {
  if (val === null || val === undefined) return <span className="text-muted-foreground/30 font-bold">—</span>;

  // Formatação de porcentagem para colunas específicas
  const lowerHeader = header.toLowerCase();
  const lowerTable = tableName.toLowerCase();
  
  if (
    (lowerTable === 'alunos_simulados' && lowerHeader === 'desempenho') ||
    (lowerTable === 'questao_simulado' && lowerHeader === 'acertos')
  ) {
    const num = parseFloat(String(val));
    if (!isNaN(num)) {
      // Se for decimal tipo 0.85 (0 a 1), multiplicamos por 100, caso contrário apenas botamos %
      // (Se por acaso o banco já tem 85, mantemos. Se for 0.85, vira 85%)
      if (num <= 1 && num > 0 && String(val).includes('.')) {
        return `${Number((num * 100).toFixed(2))}%`;
      }
      return `${Number(num.toFixed(2))}%`;
    }
  }
  
  if (val instanceof Date) {
    return val.toLocaleDateString('pt-BR');
  }

  if (typeof val === 'string') {
    // Detecta se a string parece uma data formatada "Fri Feb 20 2026..." ou ISO
    const parsedDate = new Date(val);
    if (!isNaN(parsedDate.getTime()) && (val.includes('GMT') || /^\d{4}-\d{2}-\d{2}/.test(val))) {
      if (val.length === 10) parsedDate.setMinutes(parsedDate.getMinutes() + parsedDate.getTimezoneOffset());
      return parsedDate.toLocaleDateString('pt-BR');
    }
  }

  return String(val);
};

function DataManagementPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [escola, setEscola] = useState("");
  const [bimestre, setBimestre] = useState("");
  const [anoMes, setAnoMes] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const { data: tablesData, isLoading: loadingTables } = useQuery({
    queryKey: ["mysql-tables"],
    queryFn: () => getMySQLTables(),
    enabled: !!user,
  });

  const { data: escolasData } = useQuery({
    queryKey: ["mysql-escolas"],
    queryFn: () => getEscolas(),
    enabled: !!user,
  });

  const { data: tableData, isLoading: loadingData, refetch: refetchData } = useQuery({
    queryKey: ["mysql-table-data", selectedTable, escola, bimestre, anoMes],
    queryFn: () => getTableData({ data: { tableName: selectedTable!, escola, bimestre, ano_mes: anoMes } }),
    enabled: !!selectedTable,
  });

  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map(row => headers.map(header => JSON.stringify(row[header] ?? "")).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exportação de ${filename} concluída!`);
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const tables = tablesData?.success ? tablesData.tables : [];

  return (
    <MainLayout>
      <main className="w-full">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-sm">
              <Database className="h-3 w-3" />
              Sincronização & Dados
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl text-gradient">
              Gerenciamento de Dados
            </h1>
            <p className="max-w-2xl text-sm sm:text-base text-muted-foreground">
              Visualize, monitore e exporte registros brutos das tabelas do ecossistema Plurall (MySQL).
            </p>
          </div>
        </div>

        <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          {/* Sidebar - Tabelas */}
          <Card className="flex max-h-[42vh] flex-col overflow-hidden rounded-3xl border-white/60 bg-white/40 shadow-elegant backdrop-blur-md sm:max-h-[50vh] xl:h-[70vh] xl:max-h-none xl:rounded-[2.5rem]">
            <CardHeader className="border-b border-border/40 p-5 sm:p-6">
              <CardTitle className="text-xl font-black flex items-center gap-2">
                <TableIcon className="h-5 w-5 text-primary" />
                Tabelas
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Catálogo MySQL</CardDescription>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-y-auto custom-scrollbar">
              {loadingTables ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
                  <p className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground/40">Mapeando esquema...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tables.map((table: string) => (
                    <button
                      key={table}
                      onClick={() => setSelectedTable(table)}
                      className={`w-full text-left px-5 py-4 rounded-2xl text-sm font-bold transition-all duration-300 ${
                        selectedTable === table 
                        ? "bg-gradient-primary text-white shadow-glow translate-x-2" 
                        : "hover:bg-white/60 text-muted-foreground hover:text-primary"
                      }`}
                    >
                      {table}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conteúdo Principal */}
          <Card className="flex min-h-[65vh] min-w-0 flex-col overflow-hidden rounded-3xl border-white/60 bg-white/40 shadow-elegant backdrop-blur-md xl:h-[70vh] xl:rounded-[2.5rem]">
            <CardHeader className="flex flex-col items-start justify-between gap-4 border-b border-border/40 bg-white/20 p-5 sm:p-6 lg:flex-row lg:items-center lg:p-8">
              <div className="min-w-0">
                <CardTitle className="break-words text-xl font-black tracking-tight sm:text-2xl">
                  {selectedTable || "Selecione uma tabela"}
                </CardTitle>
                <CardDescription className="font-medium text-muted-foreground/80">
                  {selectedTable ? `Exibindo registros da tabela: ${selectedTable}` : "Inicie selecionando uma tabela ao lado"}
                </CardDescription>
              </div>
              {selectedTable && tableData?.success && (
                <Button 
                  onClick={() => exportToCSV(tableData.data as any[], selectedTable)}
                  className="h-11 w-full rounded-2xl bg-gradient-primary px-4 font-bold shadow-glow transition-transform hover:scale-[1.02] sm:w-auto sm:px-6 lg:h-12"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Gerar Relatório CSV
                </Button>
              )}
            </CardHeader>
            {selectedTable && selectedTable.toLowerCase() !== 'questao' && (
              <div className="grid gap-3 border-b border-border/40 bg-white/10 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-8">
                <Select value={escola || "all"} onValueChange={(v) => setEscola(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-full bg-white/50 backdrop-blur-sm">
                    <SelectValue placeholder="Filtrar por Escola..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Escolas</SelectItem>
                    {escolasData?.success && escolasData.escolas.map((esc: string) => (
                      <SelectItem key={esc} value={esc}>{esc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bimestre || "all"} onValueChange={(v) => setBimestre(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-full bg-white/50 backdrop-blur-sm">
                    <SelectValue placeholder="Filtrar por Bimestre..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Bimestres</SelectItem>
                    <SelectItem value="1° bimestre">1° Bimestre</SelectItem>
                    <SelectItem value="2° bimestre">2° Bimestre</SelectItem>
                    <SelectItem value="3° bimestre">3° Bimestre</SelectItem>
                    <SelectItem value="4° bimestre">4° Bimestre</SelectItem>
                  </SelectContent>
                </Select>

                <Input 
                  placeholder="Filtrar por Ano/Mês (ex: 2024-05)..." 
                  value={anoMes} 
                  onChange={e => setAnoMes(e.target.value)} 
                  className="w-full bg-white/50 backdrop-blur-sm"
                />
              </div>
            )}
            <CardContent className="p-0 flex-1 overflow-hidden flex flex-col relative">
              {!selectedTable ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground bg-white/10">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/60 shadow-inner sm:h-24 sm:w-24 sm:rounded-[2.5rem]">
                    <Database className="h-12 w-12 text-primary/20" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground/80">Nenhum dado em exibição</h3>
                  <p className="max-w-xs text-center text-sm font-medium mt-1">Selecione uma das tabelas no catálogo à esquerda para visualizar seus registros.</p>
                </div>
              ) : loadingData ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 bg-white/10">
                  <div className="relative flex h-16 w-16">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20 opacity-75"></span>
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  </div>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Sincronizando registros...</p>
                </div>
              ) : tableData?.success ? (
                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                  <table className="w-max min-w-full text-sm text-left">
                    <TableHeader className="sticky top-0 z-10 bg-secondary/90 backdrop-blur-md">
                      <TableRow className="border-border/40 hover:bg-transparent">
                        {Object.keys(tableData.data[0] || {}).map(header => (
                          <TableHead key={header} className="h-12 whitespace-nowrap px-4 text-[10px] font-black uppercase tracking-widest text-primary sm:h-14 sm:px-6">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tableData.data as any[]).map((row, i) => (
                        <TableRow key={i} className="group border-border/20 hover:bg-white/60 transition-colors">
                          {Object.entries(row).map(([header, val]: [string, any], j) => (
                            <TableCell key={j} className="h-12 whitespace-nowrap px-4 text-sm font-medium text-foreground/80 sm:h-14 sm:px-6">
                              {formatValue(val, header, selectedTable!)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center sm:p-12">
                  <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
                    <X className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-bold text-destructive">Falha na consulta</h3>
                  <p className="text-sm text-muted-foreground mt-1">{tableData?.error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </MainLayout>
  );
}

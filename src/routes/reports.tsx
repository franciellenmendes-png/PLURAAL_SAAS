import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Brain,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Download,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  School,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MainLayout } from "@/components/MainLayout";
import { useAuth } from "@/lib/auth";
import { getReportsAnalytics } from "@/lib/db-actions";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

const pct = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 1000) / 10}%`;
};

const int = (value: any) => Number(value || 0).toLocaleString("pt-BR");

const normalizeDifficultyLabel = (value: any) => {
  const text = String(value || "").trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalized === "BAIXA" || normalized === "FACIL") return "Fácil";
  if (normalized === "MEDIA" || normalized === "MEDIO") return "Médio";
  if (normalized === "ALTA" || normalized === "DIFICIL") return "Difícil";
  return text || "Não informada";
};

const looksLikeScoreLabel = (value: any) => {
  const text = String(value || "").trim();
  return /\d+\s*(?:,\d+|\.\d+)?\s*%/.test(text) || /\d+\s*\/\s*\d+/.test(text);
};

const isValidStudentName = (value: any) => {
  const text = String(value || "").trim();
  return text.length > 1 && !looksLikeScoreLabel(text);
};

const date = (value: any) => {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR");
};

const barWidth = (value: any) => `${Math.max(4, Math.min(100, Number(value || 0) * 100))}%`;

const skillCode = (value: any) => {
  const text = String(value || "").trim();
  if (!text) return "Habilidade";
  const withoutParens = text.match(/^\(([^)]+)\)$/)?.[1]?.trim();
  if (withoutParens) return withoutParens;
  const code = text.match(/([A-Z]{2,4}\s*C\d+|\d+[A-Z]\d+)$/i)?.[1]?.trim();
  return code || text;
};

const detailedColumns = [
  { key: "ano", label: "Ano" },
  { key: "bimestre", label: "Bimestre" },
  { key: "escola", label: "Escola" },
  { key: "serie", label: "Série" },
  { key: "nivel", label: "Nível" },
  { key: "turma", label: "Turma" },
  { key: "id_simulado", label: "ID simulado" },
  { key: "aluno", label: "Aluno" },
  { key: "desempenho", label: "Desempenho" },
];

const tableValue = (row: any, key: string) => key === "desempenho" ? pct(row[key]) : row[key] ?? "";

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const exportDetailedCsv = (rows: any[]) => {
  const escapeCsv = (value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    detailedColumns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => detailedColumns.map((column) => escapeCsv(tableValue(row, column.key))).join(",")),
  ];
  downloadBlob(new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }), "tabela-detalhada.csv");
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const columnName = (index: number) => {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
};

const escapeXml = (value: any) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const zipFiles = (files: { name: string; content: string }[]) => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const writeU16 = (view: DataView, pos: number, value: number) => view.setUint16(pos, value, true);
  const writeU32 = (view: DataView, pos: number, value: number) => view.setUint32(pos, value, true);

  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 8, 0);
    writeU32(localView, 14, crc);
    writeU32(localView, 18, data.length);
    writeU32(localView, 22, data.length);
    writeU16(localView, 26, name.length);
    local.set(name, 30);
    chunks.push(local, data);

    const centralEntry = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralEntry.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 10, 0);
    writeU32(centralView, 16, crc);
    writeU32(centralView, 20, data.length);
    writeU32(centralView, 24, data.length);
    writeU16(centralView, 28, name.length);
    writeU32(centralView, 42, offset);
    centralEntry.set(name, 46);
    central.push(centralEntry);

    offset += local.length + data.length;
  });

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 8, files.length);
  writeU16(endView, 10, files.length);
  writeU32(endView, 12, centralSize);
  writeU32(endView, 16, offset);

  const all = [...chunks, ...central, end];
  const total = all.reduce((sum, item) => sum + item.length, 0);
  const zip = new Uint8Array(total);
  let cursor = 0;
  all.forEach((item) => {
    zip.set(item, cursor);
    cursor += item.length;
  });
  return zip;
};

const exportDetailedXlsx = (rows: any[]) => {
  const cell = (value: any, rowIndex: number, columnIndex: number) =>
    `<c r="${columnName(columnIndex)}${rowIndex}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  const header = `<row r="1">${detailedColumns.map((column, index) => cell(column.label, 1, index)).join("")}</row>`;
  const body = rows.map((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    return `<row r="${excelRow}">${detailedColumns.map((column, columnIndex) => cell(tableValue(row, column.key), excelRow, columnIndex)).join("")}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${header}${body}</sheetData></worksheet>`;
  const zip = zipFiles([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tabela detalhada" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: sheet },
  ]);
  downloadBlob(new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "tabela-detalhada.xlsx");
};

function ReportsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [uniao, setUniao] = useState("all");
  const [associacao, setAssociacao] = useState("all");
  const [escola, setEscola] = useState("all");
  const [ano, setAno] = useState("all");
  const [bimestre, setBimestre] = useState("all");
  const [nivel, setNivel] = useState("all");
  const [serie, setSerie] = useState("all");
  const [turma, setTurma] = useState("all");
  const [rankView, setRankView] = useState<"todos" | "uniao" | "associacao" | "escola">("todos");
  const [timelineMode, setTimelineMode] = useState<"ano" | "bimestre" | "ambos">("ambos");
  const [groupRankView, setGroupRankView] = useState<"serie" | "turma" | "nivel" | "todos">("serie");
  const [expandedAluno, setExpandedAluno] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const filters = useMemo(
    () => ({
      uniao: uniao === "all" ? "" : uniao,
      associacao: associacao === "all" ? "" : associacao,
      escola: escola === "all" ? "" : escola,
      ano: ano === "all" ? "" : ano,
      bimestre: bimestre === "all" ? "" : bimestre,
      nivel: nivel === "all" ? "" : nivel,
      serie: serie === "all" ? "" : serie,
      turma: turma === "all" ? "" : turma,
      userId: user?.id || "",
      userRole: user?.role || "",
    }),
    [uniao, associacao, escola, ano, bimestre, nivel, serie, turma, user?.id, user?.role],
  );

  const { data: report, error, isError, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["reports-analytics", filters],
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await getReportsAnalytics({ data: filters });
      if (!res.success) throw new Error(res.error);
      return res;
    },
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const overview: any = report?.overview || {};
  const disciplinas = (report?.disciplinas || []) as any[];
  const series = (report?.series || []) as any[];
  const escolasTop = (report?.escolasTop || []) as any[];
  const habilidades = (report?.habilidadesCriticas || []) as any[];
  const timeline = (
    (timelineMode === "ano"
      ? report?.timelineAno
      : timelineMode === "bimestre"
        ? report?.timelineBimestre
        : report?.timelineAnoBimestre || report?.timeline) || []
  ) as any[];
  const dificuldade = (report?.dificuldade || []) as any[];
  const questoes: any = report?.questoes || {};
  const alunosDestaque = (report?.alunosDestaque || []) as any[];
  const alunosAtencao = (report?.alunosAtencao || []) as any[];
  const alunoAnalises = (report?.alunoAnalises || {}) as Record<string, any>;
  const unioesAnalise = (report?.unioes || []) as any[];
  const associacoesAnalise = (report?.associacoes || []) as any[];
  const tabelaDetalhada = (report?.tabelaDetalhada || []) as any[];
  const rankAgrupamentoRows = (
    (groupRankView === "serie"
      ? report?.rankSerie
      : groupRankView === "turma"
        ? report?.rankTurma
        : groupRankView === "nivel"
          ? report?.rankNivel
          : report?.rankCombinado) || []
  ) as any[];
  const dificuldadeRosca = Object.values(
    dificuldade.reduce((acc: Record<string, any>, row: any) => {
      const name = normalizeDifficultyLabel(row.dificuldade);
      if (!acc[name]) acc[name] = { name, questoes: 0 };
      acc[name].questoes += Number(row.questoes || 0);
      return acc;
    }, {}),
  ) as any[];
  const rankOptions = [
    { id: "todos", label: "Todos" },
    { id: "uniao", label: "União" },
    { id: "associacao", label: "Associação" },
    { id: "escola", label: "Escola" },
  ] as const;

  const timelineOptions = [
    { id: "ambos", label: "Ano + bimestre" },
    { id: "ano", label: "Ano" },
    { id: "bimestre", label: "Bimestre" },
  ] as const;
  const groupRankOptions = [
    { id: "serie", label: "Serie" },
    { id: "turma", label: "Turma" },
    { id: "nivel", label: "Nivel" },
    { id: "todos", label: "Todos" },
  ] as const;

  const bestDisciplina = disciplinas[0];
  const attentionDisciplina = [...disciplinas].reverse()[0];
  const bestSerie = series[0];
  const attentionSerie = [...series].reverse()[0];
  const firstTimeline = timeline[0];
  const lastTimeline = timeline[timeline.length - 1];

  return (
    <MainLayout>
      <main className="w-full min-w-0 space-y-8">
        <section className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-sm">
              <FileText className="h-3.5 w-3.5" />
              Relatório pedagógico
            </div>
            <h1 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Leitura executiva dos <span className="text-gradient">simulados Plurall</span>
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Acompanhe o desempenho da sua rede de forma estratégica. Comece analisando o macrocenário nas métricas gerais e rankings, desça para os gargalos de habilidades e dificuldades, e identifique quais alunos precisam de intervenção imediata.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/60 bg-white/40 p-3 shadow-elegant backdrop-blur-md sm:grid-cols-2 xl:min-w-[900px] xl:grid-cols-4">
            <SearchableFilter label="União" value={uniao} allLabel="Todas as uniões" options={report?.filters?.unioes || []} onChange={(v) => { setUniao(v); setAssociacao("all"); setEscola("all"); }} />
            <SearchableFilter label="Associação" value={associacao} allLabel="Todas as associações" options={report?.filters?.associacoes || []} onChange={(v) => { setAssociacao(v); setEscola("all"); }} />
            <SearchableFilter label="Escola" value={escola} allLabel="Todas as escolas" options={report?.filters?.escolas || []} onChange={setEscola} />
            <SearchableFilter label="Ano" value={ano} allLabel="Todos os anos" options={(report?.filters?.anos || []).map(String)} onChange={setAno} />
            <SearchableFilter label="Bimestre" value={bimestre} allLabel="Todos os bimestres" options={report?.filters?.bimestres || []} onChange={setBimestre} />
            <SearchableFilter label="Nível" value={nivel} allLabel="Todos os níveis" options={report?.filters?.niveis || []} onChange={(v) => { setNivel(v); setTurma("all"); }} />
            <SearchableFilter label="Série" value={serie} allLabel="Todas as séries" options={report?.filters?.series || []} onChange={(v) => { setSerie(v); setTurma("all"); }} />
            <SearchableFilter label="Turma" value={turma} allLabel="Todas as turmas" options={report?.filters?.turmas || []} onChange={setTurma} />

            <div className="hidden">
            <Select value={uniao} onValueChange={(v) => { setUniao(v); setAssociacao("all"); setEscola("all"); }}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="União" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as uniões</SelectItem>
                {report?.filters?.unioes?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={associacao} onValueChange={(v) => { setAssociacao(v); setEscola("all"); }}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Associação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as associações</SelectItem>
                {report?.filters?.associacoes?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={escola} onValueChange={setEscola}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Escola" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as escolas</SelectItem>
                {report?.filters?.escolas?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {report?.filters?.anos?.map((item: any) => (
                  <SelectItem key={item} value={String(item)}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bimestre} onValueChange={setBimestre}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Bimestre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os bimestres</SelectItem>
                {report?.filters?.bimestres?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={nivel} onValueChange={(v) => { setNivel(v); setTurma("all"); }}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os niveis</SelectItem>
                {report?.filters?.niveis?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={serie} onValueChange={(v) => { setSerie(v); setTurma("all"); }}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Serie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as series</SelectItem>
                {report?.filters?.series?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={turma} onValueChange={setTurma}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Turma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as turmas</SelectItem>
                {report?.filters?.turmas?.map((item: string) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            <Button onClick={() => refetch()} variant="outline" className="rounded-xl bg-white/60" disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-3xl border border-white/60 bg-white/40 shadow-elegant">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Analisando base escolar...</p>
          </div>
        ) : isError ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center shadow-elegant">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <div>
              <h2 className="font-display text-2xl font-black text-foreground">Não foi possível carregar os relatórios</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                O banco retornou um erro ao montar a análise. Detalhe técnico: {error instanceof Error ? error.message : "erro desconhecido"}.
              </p>
            </div>
            <Button onClick={() => refetch()} variant="outline" className="rounded-xl bg-white/70" disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={UsersRound} label="Alunos avaliados" value={int(overview.participantes)} detail={`${int(alunosAtencao.length)} em acompanhamento`} />
              <MetricCard icon={Target} label="Desempenho escolar" value={pct(overview.desempenho_alunos)} detail="média de DESEMPENHO em alunos_simulados" tone="primary" />
              <MetricCard icon={BookOpenCheck} label="Questões aplicadas" value={int(overview.registros)} detail={`${int(overview.questoes_distintas)} questões distintas`} />
              <MetricCard icon={AlertTriangle} label="Erro médio por questão" value={pct(overview.taxa_erro)} detail={`${pct(overview.taxa_acerto)} de acerto médio`} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <InsightPanel title="Acertos x erros por habilidade" icon={BarChart3}>
                <p className="mb-5 text-sm leading-6 text-muted-foreground">
                  Identifique exatamente onde os alunos estão tropeçando. O gráfico abaixo destaca os códigos das habilidades da matriz de referência para focar a correção e o ensino.
                </p>
                <AccuracyErrorRows rows={habilidades} />
              </InsightPanel>

              <InsightPanel title="Questoes por dificuldade" icon={Brain}>
                <DifficultyDonut rows={dificuldadeRosca} />
              </InsightPanel>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 rounded-3xl border border-white/60 bg-white/45 p-4 shadow-elegant backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-black">Ranking por rede escolar</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Compare o resultado consolidado para descobrir referências positivas e unidades que demandam suporte pedagógico.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  {rankOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setRankView(option.id)}
                      className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                        rankView === option.id
                          ? "border-primary bg-primary text-white shadow-glow"
                          : "border-white/70 bg-white/60 text-muted-foreground hover:border-primary/30 hover:text-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`grid gap-6 ${rankView === "todos" ? "xl:grid-cols-3" : "xl:grid-cols-1"}`}>
                {(rankView === "todos" || rankView === "uniao") && (
                  <InsightPanel title="Uniões" icon={TrendingUp}>
                    <RankBars rows={unioesAnalise} labelKey="uniao" valueKey="desempenho" detail={(row: any) => `${int(row.escolas)} escolas • ${int(row.participantes)} alunos`} compact onSelect={(row: any) => { setUniao(row.uniao); setAssociacao("all"); setEscola("all"); }} />
                  </InsightPanel>
                )}
                {(rankView === "todos" || rankView === "associacao") && (
                  <InsightPanel title="Associações" icon={School}>
                    <RankBars rows={associacoesAnalise} labelKey="associacao" valueKey="desempenho" detail={(row: any) => `${row.uniao || "União"} • ${int(row.escolas)} escolas`} compact onSelect={(row: any) => { setAssociacao(row.associacao); setEscola("all"); }} />
                  </InsightPanel>
                )}
                {(rankView === "todos" || rankView === "escola") && (
                  <InsightPanel title="Escolas" icon={AlertTriangle}>
                    <RankBars rows={escolasTop} labelKey="escola" valueKey="desempenho" detail={(row: any) => `${int(row.participantes)} alunos • ${int(row.simulados)} simulados`} compact onSelect={(row: any) => setEscola(row.escola)} />
                  </InsightPanel>
                )}
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <InsightPanel title="Ranking dos melhores alunos" icon={TrendingUp}>
                <StudentRankList rows={alunosDestaque} analyses={alunoAnalises} expandedAluno={expandedAluno} onToggle={setExpandedAluno} order="desc" emptyText="Não há alunos suficientes para formar o ranking de destaque neste recorte." />
              </InsightPanel>

              <InsightPanel title="Alunos que precisam de atenção" icon={AlertTriangle}>
                <StudentRankList rows={alunosAtencao} analyses={alunoAnalises} expandedAluno={expandedAluno} onToggle={setExpandedAluno} order="asc" emptyText="Não há alunos suficientes para formar o ranking de atenção neste recorte." />
              </InsightPanel>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <InsightPanel title="Desempenho por disciplina" icon={GraduationCap}>
                <RankBars rows={disciplinas} labelKey="disciplina" valueKey="desempenho" detail={(row: any) => `${int(row.participantes)} alunos • ${int(row.registros)} registros`} />
              </InsightPanel>

              <InsightPanel title="Ranking por série, turma e nível" icon={TrendingDown}>
                <SegmentedButtons options={groupRankOptions} value={groupRankView} onChange={setGroupRankView} />
                <div className="mt-5">
                  <RankBars rows={rankAgrupamentoRows} labelKey="grupo" valueKey="desempenho" detail={(row: any) => `${row.tipo || "Grupo"} • ${int(row.participantes)} alunos • ${int(row.simulados)} simulados`} />
                </div>
              </InsightPanel>
            </section>

            <section className="grid gap-6">
              <InsightPanel title="Evolução temporal" icon={CalendarDays}>
                <p className="mb-5 text-sm leading-6 text-muted-foreground">
                  A série temporal ajuda a perceber se a base está crescendo, estabilizando ou mudando de perfil ao longo das aplicações.
                </p>
                <SegmentedButtons options={timelineOptions} value={timelineMode} onChange={setTimelineMode} />
                <div className="mt-5">
                <TimelineChart rows={timeline} />
                </div>
                {firstTimeline && lastTimeline && (
                  <div className="mt-5 rounded-2xl bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                    Do primeiro período analisado ({firstTimeline.periodo}) ao último ({lastTimeline.periodo}), o desempenho foi de <strong className="text-foreground">{pct(firstTimeline.desempenho)}</strong> para <strong className="text-foreground">{pct(lastTimeline.desempenho)}</strong>.
                  </div>
                )}
              </InsightPanel>
            </section>

            <section className="grid gap-6">
              <InsightPanel title="Tabela detalhada" icon={FileText}>
                <DetailedDataTable rows={tabelaDetalhada} />
              </InsightPanel>
            </section>

            <section className="rounded-3xl border border-white/60 bg-white/45 p-6 shadow-elegant backdrop-blur-md sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-black">Plano de ação sugerido</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    A leitura abaixo converte o diagnóstico em próximos passos para coordenação, professores e acompanhamento escolar.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <ActionCard title="1. Proteger o que funciona" text={`Usar ${bestDisciplina?.disciplina || "as áreas de melhor resultado"} como referência de prática: mapear materiais, sequência didática e forma de correção que sustentam o desempenho.`} />
                <ActionCard title="2. Repor pré-requisitos" text={`Priorizar ${attentionDisciplina?.disciplina || "as áreas de menor desempenho"} e ${attentionSerie?.serie || "as séries críticas"} com listas curtas de habilidades, revisão orientada e nova checagem em 2 a 3 semanas.`} />
                <ActionCard title="3. Intervir por habilidade" text={`Comparar as habilidades com maior e menor acerto para replicar boas práticas e planejar retomadas com base nos erros recorrentes, tratando erro como evidência didática e não apenas como nota baixa.`} />
              </div>
            </section>
          </>
        )}
      </main>
    </MainLayout>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }: any) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/45 p-5 shadow-elegant backdrop-blur-md">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone === "primary" ? "bg-gradient-primary text-white shadow-glow" : "bg-white/70 text-primary"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{detail}</p>
    </div>
  );
}

function FactRow({ icon: Icon, label, value }: any) {
  return (
    <div className="flex gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-bold text-foreground/90">{value}</p>
      </div>
    </div>
  );
}

function InsightPanel({ title, icon: Icon, children }: any) {
  return (
    <section className="rounded-3xl border border-white/60 bg-white/45 p-5 shadow-elegant backdrop-blur-md sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="font-display text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SegmentedButtons({ options, value, onChange }: any) {
  return (
    <div className="grid gap-2 sm:flex">
      {options.map((option: any) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
            value === option.id
              ? "border-primary bg-primary text-white shadow-glow"
              : "border-white/70 bg-white/60 text-muted-foreground hover:border-primary/30 hover:text-primary"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SearchableFilter({ label, value, allLabel, options, onChange }: any) {
  const [open, setOpen] = useState(false);
  const normalizedOptions = Array.from(new Set((options || []).map((item: any) => String(item)).filter(Boolean)));
  const selectedLabel = value === "all" ? allLabel : value || allLabel;

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 justify-between rounded-xl border-white/70 bg-white/60 px-3 text-left font-medium text-foreground/90 hover:bg-white/80"
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Pesquisar ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value={allLabel} onSelect={() => handleSelect("all")}>
                <Check className={cn("h-4 w-4", value === "all" ? "opacity-100" : "opacity-0")} />
                <span>{allLabel}</span>
              </CommandItem>
              {normalizedOptions.map((item) => (
                <CommandItem key={item} value={item} onSelect={() => handleSelect(item)}>
                  <Check className={cn("h-4 w-4", value === item ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{item}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DifficultyDonut({ rows }: { rows: any[] }) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Não há dados suficientes para a rosca de dificuldade.
      </div>
    );
  }

  const colors = ["#6d5dfc", "#14b8a6", "#f59e0b", "#ef4444", "#64748b"];
  const order = ["Difícil", "Fácil", "Médio"];
  const sortedRows = [...rows].sort((a, b) => {
    const aOrder = order.indexOf(a.name);
    const bOrder = order.indexOf(b.name);
    if (aOrder !== -1 || bOrder !== -1) {
      return (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
    }
    return Number(b.questoes || 0) - Number(a.questoes || 0);
  });
  const total = sortedRows.reduce((sum, row) => sum + Number(row.questoes || 0), 0);

  return (
    <div className="space-y-5">
      <div className="h-[260px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={sortedRows} dataKey="questoes" nameKey="name" innerRadius={68} outerRadius={98} paddingAngle={3}>
              {sortedRows.map((row, index) => (
                <Cell key={row.name} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any) => [int(value), "Questões"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {sortedRows.map((row, index) => (
          <div key={row.name} className="flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/50 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <p className="truncate text-sm font-black text-foreground">{row.name}</p>
            </div>
            <p className="shrink-0 text-xs font-black text-muted-foreground">{int(row.questoes)} • {pct(Number(row.questoes || 0) / Math.max(total, 1))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailedDataTable({ rows }: { rows: any[] }) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Não há registros para a tabela detalhada neste recorte.
      </div>
    );
  }

  const sortedRows = [...rows].sort((a, b) => Number(b.desempenho || 0) - Number(a.desempenho || 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {int(sortedRows.length)} registros ordenados do maior para o menor desempenho
        </p>
        <div className="grid gap-2 sm:flex">
          <Button type="button" variant="outline" className="rounded-xl bg-white/70" onClick={() => exportDetailedCsv(sortedRows)}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button type="button" variant="outline" className="rounded-xl bg-white/70" onClick={() => exportDetailedXlsx(sortedRows)}>
            <Download className="mr-2 h-4 w-4" />
            XLSX
          </Button>
        </div>
      </div>

      <div className="max-h-[680px] overflow-auto rounded-2xl border border-white/60 bg-white/55">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-white/95 backdrop-blur">
            <TableRow>
              <TableHead>Ano</TableHead>
              <TableHead>Bimestre</TableHead>
              <TableHead>Escola</TableHead>
              <TableHead>Série</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Turma</TableHead>
              <TableHead>ID simulado</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead className="text-right">Desempenho</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, index) => (
              <TableRow key={`${row.id_simulado}-${row.aluno}-${index}`}>
                <TableCell className="font-bold">{row.ano || "-"}</TableCell>
                <TableCell>{row.bimestre || "-"}</TableCell>
                <TableCell className="min-w-[240px]">{row.escola || "-"}</TableCell>
                <TableCell>{row.serie || "-"}</TableCell>
                <TableCell>{row.nivel || "-"}</TableCell>
                <TableCell>{row.turma || "-"}</TableCell>
                <TableCell>{row.id_simulado || "-"}</TableCell>
                <TableCell className="min-w-[240px] font-medium">{row.aluno || "-"}</TableCell>
                <TableCell className="text-right font-black text-primary">{pct(row.desempenho)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StudentRankList({ rows, analyses, expandedAluno, onToggle, emptyText, order = "desc" }: any) {
  const validRows = (rows || []).filter((row: any) => isValidStudentName(row.aluno));

  if (!validRows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const sortedRows = [...validRows].sort((a: any, b: any) => {
    if (order === "asc") {
      return (
        Number(a.desempenho || 0) - Number(b.desempenho || 0) ||
        Number(b.total_erros || 0) - Number(a.total_erros || 0) ||
        Number(b.simulados || 0) - Number(a.simulados || 0)
      );
    }
    return (
      Number(b.desempenho || 0) - Number(a.desempenho || 0) ||
      Number(b.total_acertos || 0) - Number(a.total_acertos || 0) ||
      Number(b.simulados || 0) - Number(a.simulados || 0)
    );
  });

  return (
    <div className="max-h-[620px] space-y-3 overflow-y-auto pr-2">
      {sortedRows.map((row: any, index: number) => {
        const analysisKey = `${row.aluno}|${row.escola}|${row.serie}`;
        const key = `${analysisKey}|${row.nivel || ""}|${row.turma || ""}`;
        const opened = expandedAluno === key;
        const analysis = analyses?.[analysisKey] || {};
        const resumo = analysis.resumo || row;
        const habilidadesAluno = (analysis.habilidades || []).slice(0, 5);
        const totalQuestoes = Number(resumo.total_questoes || 0);
        const totalAcertos = Number(resumo.total_acertos || 0);
        const totalErros = Number(resumo.total_erros || Math.max(0, totalQuestoes - totalAcertos));

        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(opened ? "" : key)}
            className="w-full rounded-2xl border border-white/60 bg-white/50 p-4 text-left transition-all hover:border-primary/30 hover:bg-white/80 hover:shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-black text-foreground">{index + 1}. {row.aluno || "Aluno não informado"}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {row.escola || "Escola"} • {row.serie || "Série não informada"}{row.turma ? ` • ${row.turma}` : ""}{row.nivel ? ` • ${row.nivel}` : ""} • {int(row.simulados)} simulados • {int(row.total_acertos)} acertos
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">{pct(row.desempenho)}</span>
            </div>

            {opened && (
              <div className="mt-4 space-y-4 rounded-2xl bg-white/60 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Questões" value={int(totalQuestoes)} />
                  <MiniStat label="Acertos" value={int(totalAcertos)} tone="primary" />
                  <MiniStat label="Erros" value={int(totalErros)} tone="danger" />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  O aluno tem desempenho médio de <strong className="font-black text-foreground">{pct(resumo.desempenho)}</strong>. As métricas de habilidades abaixo refletem o aproveitamento real desse aluno nas disciplinas que englobam tais habilidades, ajudando a traçar um plano de estudos personalizado.
                </p>
                <div className="space-y-2">
                  {habilidadesAluno.map((skill: any, skillIndex: number) => (
                    <div key={`${skill.habilidade}-${skillIndex}`} className="rounded-xl border border-white/70 bg-white/70 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-xs font-black text-foreground">{skill.cod_habilidade || skillCode(skill.habilidade)}</p>
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">{skill.disciplina || "Disciplina"} • {skill.dificuldade || "Dificuldade"} • {int(skill.questoes)} questões</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-black text-destructive">{pct(skill.erros_medio)} erro</span>
                      </div>
                    </div>
                  ))}
                  {!habilidadesAluno.length && (
                    <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                      Ainda não há habilidades suficientes vinculadas para detalhar este aluno no recorte atual.
                    </p>
                  )}
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value, tone }: any) {
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone === "danger" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function TimelineChart({ rows }: { rows: any[] }) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Não há dados suficientes para montar a evolução temporal.
      </div>
    );
  }

  const data = rows
    .map((row) => ({
      ...row,
      periodo: row.periodo || `${row.ano || ""} ${row.bimestre || ""}`.trim(),
      desempenhoPercentual: Math.round(Number(row.desempenho || 0) * 1000) / 10,
    }))
    .sort((a, b) => Number(b.desempenhoPercentual || 0) - Number(a.desempenhoPercentual || 0));

  return (
    <div className="space-y-4">
      <div className="h-[320px] min-w-0 rounded-2xl border border-white/60 bg-white/50 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: -16, bottom: 36 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.35)" />
            <XAxis
              dataKey="periodo"
              interval={0}
              angle={-25}
              textAnchor="end"
              height={58}
              tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
              formatter={(value: any, name: any, props: any) => [
                name === "desempenhoPercentual" ? `${value}%` : int(value),
                name === "desempenhoPercentual" ? "Desempenho" : name,
              ]}
              labelFormatter={(label) => `Período: ${label}`}
            />
            <Bar dataKey="desempenhoPercentual" radius={[8, 8, 0, 0]} fill="#6d5dfc" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((row) => (
          <div key={row.periodo} className="rounded-2xl border border-white/60 bg-white/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-foreground">{row.periodo}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{int(row.participantes)} alunos • {int(row.registros)} registros</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">{pct(row.desempenho)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankBars({ rows, labelKey, valueKey, detail, compact = false, onSelect }: any) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Não há dados suficientes para este recorte.
      </div>
    );
  }

  const sortedRows = [...rows].sort((a: any, b: any) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0));

  return (
    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-2">
      {sortedRows.map((row: any, index: number) => (
        <button
          key={`${row[labelKey]}-${index}`}
          type="button"
          onClick={() => onSelect?.(row)}
          className={`w-full rounded-2xl border border-white/60 bg-white/50 p-4 text-left transition-all ${onSelect ? "hover:border-primary/30 hover:bg-white/80 hover:shadow-card" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`${compact ? "text-xs" : "text-sm"} break-words font-black text-foreground/90`}>{row[labelKey] || "Não informado"}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{detail?.(row)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">{pct(row[valueKey])}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-primary" style={{ width: barWidth(row[valueKey]) }} />
          </div>
        </button>
      ))}
    </div>
  );
}

function AccuracyErrorRows({ rows }: { rows: any[] }) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Não há dados suficientes para comparar acertos e erros.
      </div>
    );
  }

  const sortedRows = [...rows].sort((a: any, b: any) => {
    const aValue = Number(a.acertos_medio ?? a.desempenho ?? 0);
    const bValue = Number(b.acertos_medio ?? b.desempenho ?? 0);
    return bValue - aValue;
  });

  return (
    <div className="max-h-[560px] space-y-4 overflow-y-auto pr-2">
      {sortedRows.map((row, index) => {
        const acerto = row.acertos_medio ?? row.desempenho;
        const erro = row.erros_medio ?? row.erro_medio;
        return (
        <div key={`${row.habilidade || row.disciplina}-${index}`} className="rounded-2xl border border-white/60 bg-white/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-black text-foreground">{row.cod_habilidade || skillCode(row.habilidade || row.disciplina)}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{row.disciplina || "Disciplina"} • {row.dificuldade || "Dificuldade"} • {int(row.questoes)} aplicações</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-black text-primary">{pct(acerto)} acerto</p>
              <p className="text-xs font-black text-destructive">{pct(erro)} erro</p>
            </div>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-gradient-primary" style={{ width: barWidth(acerto) }} />
            <div className="bg-destructive/60" style={{ width: barWidth(erro) }} />
          </div>
        </div>
      )})}
    </div>
  );
}

function ActionCard({ title, text }: any) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/50 p-5">
      <p className="font-display text-lg font-black text-primary">{title}</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}


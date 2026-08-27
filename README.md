# 📊 PLURALL SAAS - Painel de Relatórios & BI

Sistema SaaS Web completo para gestão, visualização e exportação de relatórios, simulados e métricas educacionais da plataforma Plurall.

---

## 🚀 Tecnologias Utilizadas

- **Frontend**: React 19, TypeScript, TailwindCSS, Lucide Icons, Recharts, Radix UI
- **Routing & SSR**: TanStack Router & TanStack Start
- **Backend / API**: Node.js Server Adapter (`node-server.mjs`) integrado com MySQL / Railway
- **Banco de Dados**: MySQL Cloud (Railway)
- **Deploy**: Railway / Cloud Hosting

---

## 📁 Estrutura do Projeto

```text
.
├── img/                       # Imagens e ícones da aplicação
├── src/
│   ├── components/            # Componentes visuais e UI (Shadcn/Radix)
│   ├── hooks/                 # React Hooks customizados
│   ├── integrations/          # Integrações e clientes de dados
│   ├── lib/                   # Utilitários, autenticação e conexão MySQL Cloud
│   ├── routes/                # Rotas da aplicação (Dashboard, Relatórios, Admin, etc.)
│   ├── server.ts              # Handlers do servidor TanStack Start
│   └── start.ts               # Ponto de entrada do cliente
├── supabase/                  # Configurações e migrações SQL
├── node-server.mjs            # Servidor HTTP para execução em produção (Railway)
├── railway.json               # Configuração oficial de Build e Deploy no Railway
├── package.json               # Dependências e scripts
└── vite.config.ts             # Configuração do Vite e TanStack Start
```

---

## ⚙️ Configuração e Execução Local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

3. Para gerar a build de produção:
   ```bash
   npm run build
   ```

4. Para iniciar o servidor de produção:
   ```bash
   npm start
   ```

---

## ☁️ Deploy no Railway

O repositório já está configurado via `railway.json` para realizar o build e inicializar automaticamente o serviço através do script `npm start`.

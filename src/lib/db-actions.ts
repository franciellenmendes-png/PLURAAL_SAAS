import { createServerFn } from "@tanstack/react-start";
import {
  clearSession,
  createTemporaryPassword,
  getCurrentSessionUser,
  hashPassword,
  isAdminRole,
  isPasswordHash,
  issueSession,
  requireAdminUser,
  requireSessionUser,
  verifyPassword,
} from "./auth.server";

export const getMySQLTables = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      // Retorna apenas as tabelas permitidas para visualização no Gerenciamento
      const tables = ['alunos_simulados', 'mapa_simulados', 'questao', 'questao_simulado'];
      return { success: true, tables };
    } catch (error: any) {
      console.error("MySQL Error:", error);
      return { success: false, error: error.message };
    }
  });

export const getEscolas = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireSessionUser(pool);
      // Tenta buscar da tabela escolas_plurall ou escolas_pluraal (lidando com erros de digitação comuns)
      let escolas: string[] = [];
      try {
        const [rows]: any = await pool.query(`SELECT DISTINCT escola FROM escolas_pluraal WHERE escola IS NOT NULL AND escola != '' ORDER BY escola`);
        escolas = rows.map((r: any) => r.escola);
      } catch (err) {
        try {
          const [rows2]: any = await pool.query(`SELECT DISTINCT escola FROM escolas_plurall WHERE escola IS NOT NULL AND escola != '' ORDER BY escola`);
          escolas = rows2.map((r: any) => r.escola);
        } catch (err2) {
          // Fallback absoluto: extrai as escolas ativas diretamente dos alunos simulados
          const [rows3]: any = await pool.query(`SELECT DISTINCT escola FROM alunos_simulados WHERE escola IS NOT NULL AND escola != '' ORDER BY escola`);
          escolas = rows3.map((r: any) => r.escola);
        }
      }
      return { success: true, escolas };
    } catch (error: any) {
      console.error("Erro ao buscar escolas:", error);
      return { success: false, error: error.message };
    }
  });

export const getTableData = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { tableName: string; escola?: string; bimestre?: string; ano_mes?: string } }) => {
    try {
      const { tableName, escola, bimestre, ano_mes } = data;
      const { default: pool } = await import("./mysql.server");
      await requireSessionUser(pool);
      // Mantendo a lista sincronizada com o que é exibido no frontend
      const allowedTables = ['alunos_simulados', 'mapa_simulados', 'questao', 'questao_simulado'];
      if (!allowedTables.includes(tableName.toLowerCase())) {
        throw new Error("Tabela não autorizada");
      }

      let query = `SELECT * FROM ${tableName}`;
      let conditions = [];
      let params = [];

      // Descobrir as colunas reais da tabela para não dar erro se faltar uma
      const [columnsData]: any = await pool.query(`SHOW COLUMNS FROM ??`, [tableName]);
      const columnNames = columnsData.map((c: any) => c.Field.toLowerCase());

      if (tableName.toLowerCase() !== 'questao') {
        if (escola && columnNames.includes('escola')) {
          conditions.push(`escola = ?`);
          params.push(escola);
        }
        if (bimestre && columnNames.includes('bimestre')) {
          // Extrai o número para evitar problemas com 1º vs 1°
          const numMatch = bimestre.match(/\d/);
          if (numMatch) {
            conditions.push(`bimestre LIKE ?`);
            params.push(`%${numMatch[0]}%imestre%`);
          } else {
            conditions.push(`bimestre LIKE ?`);
            params.push(`%${bimestre}%`);
          }
        }
        if (ano_mes) {
          // Aplica o filtro de data na coluna que estiver disponível na tabela
          if (columnNames.includes('ano_mes')) {
            conditions.push(`ano_mes LIKE ?`);
            params.push(`%${ano_mes}%`);
          } else if (columnNames.includes('data_inicio')) {
            conditions.push(`data_inicio LIKE ?`);
            params.push(`%${ano_mes}%`);
          } else if (columnNames.includes('ano')) {
            conditions.push(`ano LIKE ?`);
            params.push(`%${ano_mes}%`);
          }
        }
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
      }
      query += ` LIMIT 1000`;

      const [rows] = await pool.query(query, params);
      return { success: true, data: rows };
    } catch (error: any) {
      console.error("MySQL Error:", error);
      return { success: false, error: error.message };
    }
  });

export const syncDatabase = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const mysql = (await import("mysql2/promise")).default;
      const { default: authPool } = await import("./mysql.server");
      await requireAdminUser(authPool);

      const schemaSQL = `
        CREATE TABLE IF NOT EXISTS usuarios (
            id_user INT AUTO_INCREMENT PRIMARY KEY,
            usuario VARCHAR(50) NOT NULL UNIQUE,
            nome_user VARCHAR(150) NOT NULL,
            email_user VARCHAR(150) NOT NULL UNIQUE,
            senha VARCHAR(255) NOT NULL,
            primeiro_acesso BOOLEAN DEFAULT TRUE,
            associacao_uniao VARCHAR(150),
            nivel ENUM('admin', 'admin2', 'coordenacao') NOT NULL DEFAULT 'coordenacao',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS links_bi (
            id_link INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(100) NOT NULL,
            url_link TEXT NOT NULL,
            descricao TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS paginas (
            id_pagina INT AUTO_INCREMENT PRIMARY KEY,
            nome_pagina VARCHAR(100) NOT NULL,
            rota_pagina VARCHAR(100) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS permissoes_links (
            id_user INT NOT NULL,
            id_link INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id_user, id_link),
            FOREIGN KEY (id_user) REFERENCES usuarios(id_user) ON DELETE CASCADE,
            FOREIGN KEY (id_link) REFERENCES links_bi(id_link) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS permissoes_paginas (
            id_user INT NOT NULL,
            id_pagina INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id_user, id_pagina),
            FOREIGN KEY (id_user) REFERENCES usuarios(id_user) ON DELETE CASCADE,
            FOREIGN KEY (id_pagina) REFERENCES paginas(id_pagina) ON DELETE CASCADE
        );
      `;

      const runSync = async (config: any, dbName: string) => {
        console.log(`[SYNC] Conectando ao banco ${dbName}...`);
        const connection = await mysql.createConnection(config);
        const queries = schemaSQL.split(';').filter((q: string) => q.trim().length > 0);
        for (const q of queries) {
          await connection.query(q);
        }
        
        await connection.query(`
          INSERT IGNORE INTO usuarios (usuario, nome_user, email_user, senha, associacao_uniao, nivel, primeiro_acesso)
          VALUES ('KAREN', 'Karen', 'KARENALIXAVI@GMAIL.COM', '${hashPassword("MUDAR@123")}', 'GERAL', 'admin', TRUE)
        `);
        
        await connection.end();
        console.log(`[SYNC] Banco ${dbName} sincronizado com sucesso!`);
      };

      await runSync({
        host: process.env.LOCAL_HOST,
        port: Number(process.env.LOCAL_PORT) || 3306,
        database: process.env.LOCAL_DB,
        user: process.env.LOCAL_USER,
        password: process.env.LOCAL_PASSWORD,
      }, "Local");

      await runSync({
        host: process.env.CLOUD_HOST,
        port: Number(process.env.CLOUD_PORT) || 4000,
        database: process.env.CLOUD_DB,
        user: process.env.CLOUD_USER,
        password: process.env.CLOUD_PASSWORD,
        ssl: { rejectUnauthorized: false }
      }, "Nuvem (TiDB)");

      return { success: true, message: "Bancos sincronizados com sucesso!" };
    } catch (error: any) {
      console.error("Erro na sincronização:", error);
      return { success: false, error: error.message };
    }
  });

export const syncLocalToRailway = createServerFn({ method: "POST" })
  .handler(async () => {
    const dataTables = [
      "escolas_pluraal",
      "escolas_plurall",
      "alunos_simulados",
      "mapa_simulados",
      "questao",
      "questao_simulado",
      "links_bi",
    ];

    const quoteId = (value: string) => `\`${value.replace(/`/g, "``")}\``;

    try {
      const mysql = (await import("mysql2/promise")).default;
      const { default: authPool } = await import("./mysql.server");
      await requireAdminUser(authPool);

      const local = await mysql.createConnection({
        host: process.env.LOCAL_HOST,
        port: Number(process.env.LOCAL_PORT) || 3306,
        database: process.env.LOCAL_DB,
        user: process.env.LOCAL_USER,
        password: process.env.LOCAL_PASSWORD,
      });

      const cloud = await mysql.createConnection({
        host: process.env.CLOUD_HOST,
        port: Number(process.env.CLOUD_PORT) || 4000,
        database: process.env.CLOUD_DB,
        user: process.env.CLOUD_USER,
        password: process.env.CLOUD_PASSWORD,
        ssl: { rejectUnauthorized: false },
      });

      try {
        const results: { table: string; rows: number; status: string }[] = [];

        for (const table of dataTables) {
          const [exists]: any = await local.query("SHOW TABLES LIKE ?", [table]);
          if (!exists.length) {
            results.push({ table, rows: 0, status: "ignorada: nao existe no local" });
            continue;
          }

          const [createRows]: any = await local.query(`SHOW CREATE TABLE ${quoteId(table)}`);
          const createSql = String(createRows[0]["Create Table"]).replace(/^CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS");
          await cloud.query(createSql);

          const [columnsData]: any = await local.query(`SHOW COLUMNS FROM ${quoteId(table)}`);
          const columns = columnsData.map((column: any) => String(column.Field));
          if (!columns.length) {
            results.push({ table, rows: 0, status: "ignorada: sem colunas" });
            continue;
          }

          const [pkRows]: any = await local.query(`SHOW KEYS FROM ${quoteId(table)} WHERE Key_name = 'PRIMARY'`);
          const primaryKeys = new Set(pkRows.map((row: any) => String(row.Column_name)));
          const updateColumns = columns.filter((column) => !primaryKeys.has(column));
          const updateClause = updateColumns.length
            ? ` ON DUPLICATE KEY UPDATE ${updateColumns.map((column) => `${quoteId(column)} = VALUES(${quoteId(column)})`).join(", ")}`
            : "";
          const insertSql = `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(", ")}) VALUES ?${updateClause}`;

          let copied = 0;
          let offset = 0;
          const batchSize = 1000;

          while (true) {
            const [rows]: any = await local.query(`SELECT * FROM ${quoteId(table)} LIMIT ? OFFSET ?`, [batchSize, offset]);
            if (!rows.length) break;

            await cloud.query(insertSql, [rows.map((row: any) => columns.map((column) => row[column]))]);
            copied += rows.length;
            offset += rows.length;
          }

          results.push({ table, rows: copied, status: "sincronizada" });
        }

        const total = results.reduce((sum, item) => sum + item.rows, 0);
        return {
          success: true,
          message: `Sincronizacao concluida: ${total.toLocaleString("pt-BR")} linhas processadas.`,
          results,
        };
      } finally {
        await local.end();
        await cloud.end();
      }
    } catch (error: any) {
      console.error("Erro na sincronizacao local -> Railway:", error);
      return { success: false, error: error.message };
    }
  });

export const loginUser = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { login_ou_email: string; senha_pura: string } }) => {
    try {
      const { default: pool } = await import("./mysql.server");

      const loginLower = data.login_ou_email.toLowerCase();
      const [rows]: any = await pool.query(
        `SELECT id_user, usuario, nome_user, email_user, associacao_uniao, nivel, primeiro_acesso, senha
         FROM usuarios 
         WHERE LOWER(usuario) = ? OR LOWER(email_user) = ? LIMIT 1`,
        [loginLower, loginLower]
      );

      if (rows.length === 0) {
        return { success: false, error: "Usuário ou email não encontrado." };
      }

      const user = rows[0];
      if (!verifyPassword(data.senha_pura, String(user.senha || ""))) {
        return { success: false, error: "Senha incorreta." };
      }

      if (!isPasswordHash(String(user.senha || ""))) {
        await pool.query(`UPDATE usuarios SET senha = ? WHERE id_user = ?`, [
          hashPassword(data.senha_pura),
          user.id_user,
        ]);
      }

      issueSession(String(user.id_user));

      return { 
        success: true, 
        user: {
          id: String(user.id_user),
          email: user.email_user,
          full_name: user.nome_user,
          role: user.nivel,
          associacao_uniao: user.associacao_uniao,
          primeiro_acesso: user.primeiro_acesso === 1
        }
      };
    } catch (error: any) {
      console.error("Login Error:", error);
      return { success: false, error: "Erro no servidor ao tentar logar." };
    }
  });

export const getCurrentUser = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { default: pool } = await import("./mysql.server");
      const user = await getCurrentSessionUser(pool);
      return { success: true, user };
    } catch (error: any) {
      console.error("Current User Error:", error);
      return { success: false, error: "Erro ao validar sessão." };
    }
  });

export const logoutUser = createServerFn({ method: "POST" })
  .handler(async () => {
    clearSession();
    return { success: true };
  });

export const updatePassword = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { userId: string; novaSenhaPura: string } }) => {
    try {
      if (!data.novaSenhaPura || data.novaSenhaPura.length < 8) {
        return { success: false, error: "A senha deve ter no mínimo 8 caracteres." };
      }

      const { default: pool } = await import("./mysql.server");
      const sessionUser = await requireSessionUser(pool);
      if (sessionUser.id !== String(data.userId) && !isAdminRole(sessionUser.role)) {
        return { success: false, error: "Você não tem permissão para alterar esta senha." };
      }

      await pool.query(
        `UPDATE usuarios SET senha = ?, primeiro_acesso = FALSE WHERE id_user = ?`,
        [hashPassword(data.novaSenhaPura), data.userId]
      );
      return { success: true };
    } catch (error: any) {
      console.error("Update Password Error:", error);
      return { success: false, error: "Erro ao atualizar senha no banco." };
    }
  });

export const sendPasswordResetCode = createServerFn({ method: "POST" })
  .handler(async ({ data: email }: { data: string }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      try {
        await pool.query(`ALTER TABLE usuarios ADD COLUMN reset_codigo VARCHAR(10), ADD COLUMN reset_expira DATETIME`);
      } catch(e) {}

      const [rows]: any = await pool.query(`SELECT id_user FROM usuarios WHERE email_user = ?`, [email]);
      if (rows.length === 0) return { success: false, error: "E-mail não encontrado." };

      const codigo = Math.floor(100000 + Math.random() * 900000).toString();
      const expira = new Date();
      expira.setMinutes(expira.getMinutes() + 15);

      await pool.query(
        `UPDATE usuarios SET reset_codigo = ?, reset_expira = ? WHERE email_user = ?`,
        [codigo, expira, email]
      );

      console.log(`\n\n=== EMAIL SIMULADO ===\nPara: ${email}\nAssunto: Recuperação de Senha\nSeu código de segurança é: ${codigo}\nEle expira em 15 minutos.\n======================\n\n`);

      return { success: true, message: "Código enviado para o e-mail!" };
    } catch (error: any) {
      console.error("Reset Error:", error);
      return { success: false, error: "Erro interno ao gerar código." };
    }
  });

export const resetPasswordWithCode = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { email: string; codigo: string; novaSenhaPura: string } }) => {
    try {
      if (!data.novaSenhaPura || data.novaSenhaPura.length < 8) {
        return { success: false, error: "A senha deve ter no mínimo 8 caracteres." };
      }

      const { default: pool } = await import("./mysql.server");
      const [rows]: any = await pool.query(
        `SELECT id_user, reset_codigo, reset_expira FROM usuarios WHERE email_user = ?`,
        [data.email]
      );

      if (rows.length === 0) return { success: false, error: "E-mail não encontrado." };
      
      const user = rows[0];
      if (user.reset_codigo !== data.codigo) return { success: false, error: "Código inválido." };
      if (new Date() > new Date(user.reset_expira)) return { success: false, error: "O código expirou. Solicite um novo." };

      await pool.query(
        `UPDATE usuarios SET senha = ?, reset_codigo = NULL, reset_expira = NULL, primeiro_acesso = FALSE WHERE id_user = ?`,
        [hashPassword(data.novaSenhaPura), user.id_user]
      );

      return { success: true };
    } catch (error: any) {
      return { success: false, error: "Erro ao redefinir a senha." };
    }
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .handler(async ({ data: userId }: { data: string }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      const defaultPassword = createTemporaryPassword();
      await pool.query(
        `UPDATE usuarios SET senha = ?, primeiro_acesso = TRUE WHERE id_user = ?`,
        [hashPassword(defaultPassword), userId]
      );
      return { success: true, message: `Senha temporária gerada: ${defaultPassword}`, temporaryPassword: defaultPassword };
    } catch (error: any) {
      console.error("Reset User Password Error:", error);
      return { success: false, error: "Erro ao resetar senha no banco." };
    }
  });

export const getAdminUsers = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      const [rows]: any = await pool.query(`SELECT id_user as id, email_user as email, nome_user as full_name, nivel as role FROM usuarios ORDER BY nome_user`);
      return { success: true, users: rows.map((r: any) => ({ ...r, id: String(r.id) })) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const getAdminLinks = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      const [rows]: any = await pool.query(`SELECT id_link as id, titulo as name, url_link as url, descricao FROM links_bi ORDER BY titulo`);
      return { success: true, links: rows.map((r: any) => ({ ...r, id: String(r.id) })) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const getUserPermissions = createServerFn({ method: "POST" })
  .handler(async ({ data: userId }: { data: string }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      const [rows]: any = await pool.query(`SELECT id_link FROM permissoes_links WHERE id_user = ?`, [userId]);
      return { success: true, links: rows.map((r: any) => String(r.id_link)) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const toggleUserLink = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { userId: string; linkId: string; checked: boolean } }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      if (data.checked) {
        await pool.query(`INSERT IGNORE INTO permissoes_links (id_user, id_link) VALUES (?, ?)`, [data.userId, data.linkId]);
      } else {
        await pool.query(`DELETE FROM permissoes_links WHERE id_user = ? AND id_link = ?`, [data.userId, data.linkId]);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const toggleUserAdmin = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { userId: string; isAdmin: boolean } }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      const nivel = data.isAdmin ? 'admin' : 'coordenacao';
      await pool.query(`UPDATE usuarios SET nivel = ? WHERE id_user = ?`, [nivel, data.userId]);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { email: string; nome: string; nivel: string } }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      const defaultPassword = createTemporaryPassword();
      const usuario = data.email.split("@")[0].toUpperCase();
      
      await pool.query(
        `INSERT INTO usuarios (usuario, nome_user, email_user, senha, nivel, primeiro_acesso) 
         VALUES (?, ?, ?, ?, ?, TRUE)`,
        [usuario, data.nome, data.email, hashPassword(defaultPassword), data.nivel]
      );
      return { success: true, temporaryPassword: defaultPassword };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const createAdminLink = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { titulo: string; url: string; descricao: string } }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      await pool.query(
        `INSERT INTO links_bi (titulo, url_link, descricao) VALUES (?, ?, ?)`,
        [data.titulo, data.url, data.descricao]
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const deleteAdminLink = createServerFn({ method: "POST" })
  .handler(async ({ data: id }: { data: string }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      await pool.query(`DELETE FROM links_bi WHERE id_link = ?`, [id]);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const getDashboardLinks = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { userId: string; role: string } }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      const sessionUser = await requireSessionUser(pool);
      let query = "";
      let params: any[] = [];

      const userRole = (sessionUser.role || "").toLowerCase();
      if (userRole === 'admin' || userRole === 'admin2') {
        query = `SELECT id_link as id, titulo as name, url_link as url, descricao FROM links_bi ORDER BY titulo`;
      } else {
        query = `
          SELECT l.id_link as id, l.titulo as name, l.url_link as url, l.descricao 
          FROM links_bi l
          INNER JOIN permissoes_links p ON l.id_link = p.id_link
          WHERE p.id_user = ?
          ORDER BY l.titulo
        `;
        params = [sessionUser.id];
      }

      const [rows]: any = await pool.query(query, params);
      const links = rows.map((r: any) => ({
        ...r,
        id: String(r.id),
        slug: r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      }));
      
      return { success: true, links };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

export const getLinkBySlug = createServerFn({ method: "GET" })
  .handler(async ({ data: slug }: { data: string }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      const [rows]: any = await pool.query(
        "SELECT id_link as id, titulo as name, url_link as bi_url FROM links_bi WHERE id_link = ?",
        [slug]
      );
      return { success: true, data: rows[0] || null };
    } catch (error: any) {
      console.error("Erro ao buscar link por slug:", error);
      return { success: false, error: error.message };
    }
  });

export const updateAdminLink = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { id: string; titulo: string; url: string; descricao: string } }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      await requireAdminUser(pool);
      await pool.query(
        `UPDATE links_bi SET titulo = ?, url_link = ?, descricao = ? WHERE id_link = ?`,
        [data.titulo, data.url, data.descricao, data.id]
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

type ReportFilters = {
  uniao?: string;
  associacao?: string;
  escola?: string;
  ano?: string;
  bimestre?: string;
  nivel?: string;
  serie?: string;
  turma?: string;
  userId?: string;
  userRole?: string;
};

export const getReportsAnalytics = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data?: ReportFilters }) => {
    try {
      const { default: pool } = await import("./mysql.server");
      const filters: ReportFilters = { ...(data || {}) };
      const sessionUser = await requireSessionUser(pool);
      filters.userId = sessionUser.id;
      filters.userRole = sessionUser.role;

      const [tableRows]: any = await pool.query(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_name IN ('alunos_simulados', 'mapa_simulados', 'questao', 'questao_simulado', 'escolas_pluraal', 'escolas_plurall')
           AND (table_schema = DATABASE() OR table_schema = 'plurall')`,
      );
      const getTableName = (row: any) => String(row.table_name || row.TABLE_NAME).toLowerCase();
      const getTableSchema = (row: any) => String(row.table_schema || row.TABLE_SCHEMA);

      const availableTables = new Set(tableRows.map(getTableName));
      const questaoRow = tableRows.find((row: any) => getTableName(row) === "questao");
      const questaoTable = questaoRow
        ? `\`${getTableSchema(questaoRow)}\`.\`${getTableName(questaoRow)}\``
        : "questao";
      const schoolRow = tableRows.find((row: any) => {
        const name = getTableName(row);
        return name === "escolas_pluraal" || name === "escolas_plurall";
      });
      const schoolTable = schoolRow
        ? `\`${getTableSchema(schoolRow)}\`.\`${getTableName(schoolRow)}\``
        : null;
      const uniaoValueExpr = `COALESCE(NULLIF(TRIM(ep.SIGLA_UNIAO), ''), ep.UNIAO)`;
      const associacaoValueExpr = `COALESCE(NULLIF(TRIM(ep.SIGLA_ASSOCIACAO), ''), ep.ASSOCIACAO)`;
      const schoolMatchExpr = (left: string, right: string) => `${left} = ${right}`;
      const schoolJoinExpr = schoolMatchExpr("ep.ESCOLA", "a.escola");

      if (filters.userId) {
        const [userRows]: any = await pool.query(
          `SELECT associacao_uniao, nivel FROM usuarios WHERE id_user = ? LIMIT 1`,
          [filters.userId],
        );
        const reportUser = userRows[0];
        const userLevel = String(reportUser?.nivel || filters.userRole || "").toLowerCase();
        const userScope = String(reportUser?.associacao_uniao || "").trim();

        if (userScope && userScope.toUpperCase() !== "GERAL" && userLevel !== "admin" && userLevel !== "admin2") {
          if (schoolTable) {
            const [scopeRows]: any = await pool.query(
              `SELECT
                  ${uniaoValueExpr} as uniao,
                  ep.UNIAO as uniao_nome,
                  ${associacaoValueExpr} as associacao,
                  ep.ASSOCIACAO as associacao_nome,
                  ep.ESCOLA as escola
               FROM ${schoolTable} ep
               WHERE LOWER(?) IN (
                 LOWER(${uniaoValueExpr}),
                 LOWER(ep.UNIAO),
                 LOWER(${associacaoValueExpr}),
                 LOWER(ep.ASSOCIACAO),
                 LOWER(ep.ESCOLA)
               )
               LIMIT 1`,
              [userScope],
            );
            const scope = scopeRows[0];
            const scopeLower = userScope.toLowerCase();
            const matches = (...values: any[]) => values.some((value) => String(value || "").toLowerCase() === scopeLower);
            if (matches(scope?.escola)) {
              filters.escola = scope.escola;
              filters.associacao = "";
              filters.uniao = "";
            } else if (matches(scope?.associacao, scope?.associacao_nome)) {
              filters.associacao = scope.associacao;
              filters.escola = "";
            } else if (matches(scope?.uniao, scope?.uniao_nome)) {
              filters.uniao = scope.uniao;
              filters.associacao = "";
              filters.escola = "";
            }
          } else if (!filters.escola) {
            filters.escola = userScope;
          }
        }
      }

      const normalizeSkillCode = (value: any) => {
        const text = String(value || "").trim();
        if (!text) return "Habilidade";
        const withoutParens = text.match(/^\(([^)]+)\)$/)?.[1]?.trim();
        if (withoutParens) return withoutParens;
        const code = text.match(/([A-Z]{2,4}\s*C\d+|\d+[A-Z]\d+)$/i)?.[1]?.trim();
        return code || text;
      };
      const aggregateSkillRows = (rows: any[], includeAluno = false) => {
        const grouped = new Map<string, any>();
        rows.forEach((row: any) => {
          const code = normalizeSkillCode(row.habilidade);
          const key = [
            includeAluno ? row.analysis_key || "" : "",
            includeAluno ? row.aluno || "" : "",
            code,
            row.disciplina || "",
            row.dificuldade || "",
          ].join("|");
          const questoes = Number(row.questoes || 0);
          const current = grouped.get(key) || {
            ...row,
            habilidade: code,
            cod_habilidade: code,
            questoes: 0,
            questoes_distintas: 0,
            acertosTotal: 0,
            errosTotal: 0,
          };
          current.questoes += questoes;
          current.questoes_distintas += Number(row.questoes_distintas || 0);
          current.acertosTotal += Number(row.acertos_medio || 0) * questoes;
          current.errosTotal += Number(row.erros_medio || 0) * questoes;
          grouped.set(key, current);
        });
        return Array.from(grouped.values())
          .map((row: any) => ({
            ...row,
            acertos_medio: row.questoes ? Number((row.acertosTotal / row.questoes).toFixed(4)) : 0,
            erros_medio: row.questoes ? Number((row.errosTotal / row.questoes).toFixed(4)) : 0,
          }))
          .sort((a: any, b: any) => Number(b.acertos_medio || 0) - Number(a.acertos_medio || 0));
      };

      const [alunosColumns]: any = await pool.query(`SHOW COLUMNS FROM alunos_simulados`);
      const alunoColumnNames = new Set(alunosColumns.map((c: any) => String(c.Field).toLowerCase()));

      const alunoConditions: string[] = [];
      const alunoAliasConditions: string[] = [];
      const alunoParams: any[] = [];
      const questaoConditions: string[] = [];
      const questaoAliasConditions: string[] = [];
      const questaoParams: any[] = [];
      const mapaConditions: string[] = [];
      const mapaParams: any[] = [];

      if (filters.uniao && schoolTable) {
        alunoConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "alunos_simulados.ESCOLA")} AND ${uniaoValueExpr} = ?)`);
        alunoAliasConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "a.ESCOLA")} AND ${uniaoValueExpr} = ?)`);
        alunoParams.push(filters.uniao);
        questaoConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "questao_simulado.ESCOLA")} AND ${uniaoValueExpr} = ?)`);
        questaoAliasConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "qs.ESCOLA")} AND ${uniaoValueExpr} = ?)`);
        questaoParams.push(filters.uniao);
        mapaConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "mapa_simulados.ESCOLA")} AND ${uniaoValueExpr} = ?)`);
        mapaParams.push(filters.uniao);
      }

      if (filters.associacao && schoolTable) {
        alunoConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "alunos_simulados.ESCOLA")} AND ${associacaoValueExpr} = ?)`);
        alunoAliasConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "a.ESCOLA")} AND ${associacaoValueExpr} = ?)`);
        alunoParams.push(filters.associacao);
        questaoConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "questao_simulado.ESCOLA")} AND ${associacaoValueExpr} = ?)`);
        questaoAliasConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "qs.ESCOLA")} AND ${associacaoValueExpr} = ?)`);
        questaoParams.push(filters.associacao);
        mapaConditions.push(`EXISTS (SELECT 1 FROM ${schoolTable} ep WHERE ${schoolMatchExpr("ep.ESCOLA", "mapa_simulados.ESCOLA")} AND ${associacaoValueExpr} = ?)`);
        mapaParams.push(filters.associacao);
      }

      if (filters.escola) {
        alunoConditions.push(`ESCOLA = ?`);
        alunoAliasConditions.push(`a.ESCOLA = ?`);
        alunoParams.push(filters.escola);
        questaoConditions.push(`ESCOLA = ?`);
        questaoAliasConditions.push(`qs.ESCOLA = ?`);
        questaoParams.push(filters.escola);
        mapaConditions.push(`ESCOLA = ?`);
        mapaParams.push(filters.escola);
      }

      if (filters.ano) {
        alunoConditions.push(`ANO = ?`);
        alunoAliasConditions.push(`a.ANO = ?`);
        alunoParams.push(Number(filters.ano));
        questaoConditions.push(`ANO = ?`);
        questaoAliasConditions.push(`qs.ANO = ?`);
        questaoParams.push(Number(filters.ano));
        mapaConditions.push(`ANO = ?`);
        mapaParams.push(Number(filters.ano));
      }

      if (filters.bimestre) {
        const match = filters.bimestre.match(/\d/);
        const value = match ? `%${match[0]}%imestre%` : `%${filters.bimestre}%`;
        alunoConditions.push(`BIMESTRE LIKE ?`);
        alunoAliasConditions.push(`a.BIMESTRE LIKE ?`);
        alunoParams.push(value);
        questaoConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = questao_simulado.ID_SIMULADO AND af.ESCOLA = questao_simulado.ESCOLA AND af.BIMESTRE LIKE ?)`);
        questaoAliasConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = qs.ID_SIMULADO AND af.ESCOLA = qs.ESCOLA AND af.BIMESTRE LIKE ?)`);
        questaoParams.push(value);
        mapaConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = mapa_simulados.ID_SIMULADO AND af.ESCOLA = mapa_simulados.ESCOLA AND af.BIMESTRE LIKE ?)`);
        mapaParams.push(value);
      }

      if (filters.nivel) {
        alunoConditions.push(`NIVEL = ?`);
        alunoAliasConditions.push(`a.NIVEL = ?`);
        alunoParams.push(filters.nivel);
        questaoConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = questao_simulado.ID_SIMULADO AND af.ESCOLA = questao_simulado.ESCOLA AND af.NIVEL = ?)`);
        questaoAliasConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = qs.ID_SIMULADO AND af.ESCOLA = qs.ESCOLA AND af.NIVEL = ?)`);
        questaoParams.push(filters.nivel);
        mapaConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = mapa_simulados.ID_SIMULADO AND af.ESCOLA = mapa_simulados.ESCOLA AND af.NIVEL = ?)`);
        mapaParams.push(filters.nivel);
      }

      if (filters.serie) {
        alunoConditions.push(`SERIE = ?`);
        alunoAliasConditions.push(`a.SERIE = ?`);
        alunoParams.push(filters.serie);
        questaoConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = questao_simulado.ID_SIMULADO AND af.ESCOLA = questao_simulado.ESCOLA AND af.SERIE = ?)`);
        questaoAliasConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = qs.ID_SIMULADO AND af.ESCOLA = qs.ESCOLA AND af.SERIE = ?)`);
        questaoParams.push(filters.serie);
        mapaConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = mapa_simulados.ID_SIMULADO AND af.ESCOLA = mapa_simulados.ESCOLA AND af.SERIE = ?)`);
        mapaParams.push(filters.serie);
      }

      if (filters.turma) {
        alunoConditions.push(`TURMA = ?`);
        alunoAliasConditions.push(`a.TURMA = ?`);
        alunoParams.push(filters.turma);
        questaoConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = questao_simulado.ID_SIMULADO AND af.ESCOLA = questao_simulado.ESCOLA AND af.TURMA = ?)`);
        questaoAliasConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = qs.ID_SIMULADO AND af.ESCOLA = qs.ESCOLA AND af.TURMA = ?)`);
        questaoParams.push(filters.turma);
        mapaConditions.push(`EXISTS (SELECT 1 FROM alunos_simulados af WHERE af.ID_SIMULADO = mapa_simulados.ID_SIMULADO AND af.ESCOLA = mapa_simulados.ESCOLA AND af.TURMA = ?)`);
        mapaParams.push(filters.turma);
      }

      const alunoWhere = alunoConditions.length ? `WHERE ${alunoConditions.join(" AND ")}` : "";
      const alunoAliasWhere = alunoAliasConditions.length ? `WHERE ${alunoAliasConditions.join(" AND ")}` : "";
      const schoolAggWhere = alunoAliasWhere;
      const questaoWhere = questaoConditions.length ? `WHERE ${questaoConditions.join(" AND ")}` : "";
      const mapaWhere = mapaConditions.length ? `WHERE ${mapaConditions.join(" AND ")}` : "";
      const prefixedQuestaoWhere = questaoAliasConditions.length
        ? `WHERE ${questaoAliasConditions.join(" AND ")}`
        : "";
      const prefixedQuestaoAnd = questaoAliasConditions.length
        ? `AND ${questaoAliasConditions.join(" AND ")}`
        : "";

      const studentQuestionsExpr = `SUM(COALESCE(TOTAL_QUESTAO_SIMULADO, 0))`;
      const studentHitsExpr = `
        SUM(
          CASE
            WHEN TOTAL_ACERTOS IS NOT NULL THEN LEAST(GREATEST(TOTAL_ACERTOS, 0), COALESCE(TOTAL_QUESTAO_SIMULADO, 0))
            ELSE ROUND(LEAST(GREATEST(COALESCE(DESEMPENHO, 0), 0), 1) * COALESCE(TOTAL_QUESTAO_SIMULADO, 0))
          END
        )
      `;
      const studentResponseExpr = `SUM(COALESCE(TOTAL_QUESTAO_RESPONDIDA, 0))`;
      const studentPerformanceExpr = `ROUND(${studentHitsExpr} / NULLIF(${studentQuestionsExpr}, 0), 4)`;
      const studentAnalysisKeyExpr = (aluno = "PARTICIPANTE", escola = "ESCOLA", serie = "SERIE") =>
        `CONCAT(COALESCE(${aluno}, ''), '|', COALESCE(${escola}, ''), '|', COALESCE(${serie}, ''))`;
      const validParticipantCondition = `
        PARTICIPANTE IS NOT NULL
        AND TRIM(PARTICIPANTE) <> ''
        AND PARTICIPANTE NOT REGEXP '[0-9][[:space:]]*%'
        AND PARTICIPANTE NOT REGEXP '[0-9][[:space:]]*/[[:space:]]*[0-9]'
      `;
      const normalizeNumber = (value: any) => {
        const n = Number(value || 0);
        return Number.isFinite(n) ? n : 0;
      };
      const buildStudentRankingRows = async () => {
        const pageSize = 10000;
        let lastId = 0;
        const studentMap = new Map<string, any>();

        while (true) {
          const [rows]: any = await pool.query(
            `SELECT
                id,
                PARTICIPANTE,
                ESCOLA,
                SERIE,
                NIVEL,
                TURMA,
                ID_SIMULADO,
                TOTAL_QUESTAO_SIMULADO,
                TOTAL_QUESTAO_RESPONDIDA,
                TOTAL_ACERTOS,
                DESEMPENHO
             FROM alunos_simulados
             ${alunoWhere}
             ${alunoWhere ? "AND" : "WHERE"} ${validParticipantCondition}
               AND id > ?
             ORDER BY id
             LIMIT ?`,
            [...alunoParams, lastId, pageSize],
          );

          if (!rows.length) break;

          rows.forEach((row: any) => {
            lastId = Math.max(lastId, Number(row.id || 0));
            const aluno = String(row.PARTICIPANTE || "").trim();
            const escola = String(row.ESCOLA || "").trim();
            const serie = String(row.SERIE || "").trim();
            const nivel = String(row.NIVEL || "").trim();
            const turma = String(row.TURMA || "").trim();
            const studentKey = [aluno, escola, serie, nivel, turma].join("|");
            const simuladoKey = String(row.ID_SIMULADO || `linha-${row.id}`);
            const totalQuestoes = normalizeNumber(row.TOTAL_QUESTAO_SIMULADO);
            const acertos = row.TOTAL_ACERTOS !== null && row.TOTAL_ACERTOS !== undefined
              ? normalizeNumber(row.TOTAL_ACERTOS)
              : Math.round(Math.max(0, Math.min(1, normalizeNumber(row.DESEMPENHO))) * totalQuestoes);
            const respondidas = normalizeNumber(row.TOTAL_QUESTAO_RESPONDIDA);

            const student = studentMap.get(studentKey) || {
              aluno,
              escola,
              serie,
              nivel,
              turma,
              simuladoMap: new Map<string, any>(),
            };
            const simulado = student.simuladoMap.get(simuladoKey) || {
              registros_simulado: 0,
              total_questoes: 0,
              total_acertos: 0,
              total_respondidas: 0,
            };
            simulado.registros_simulado += 1;
            simulado.total_questoes = Math.max(simulado.total_questoes, totalQuestoes);
            simulado.total_acertos = Math.min(
              Math.max(simulado.total_acertos, acertos),
              Math.max(simulado.total_questoes, totalQuestoes),
            );
            simulado.total_respondidas = Math.min(
              Math.max(simulado.total_respondidas, respondidas),
              Math.max(simulado.total_questoes, totalQuestoes),
            );
            student.simuladoMap.set(simuladoKey, simulado);
            studentMap.set(studentKey, student);
          });

          if (rows.length < pageSize) break;
        }

        const rows = Array.from(studentMap.values()).map((student: any) => {
          const simulados = Array.from(student.simuladoMap.values());
          const registros = simulados.reduce((sum: number, simulado: any) => sum + simulado.registros_simulado, 0);
          const totalQuestoes = simulados.reduce((sum: number, simulado: any) => sum + simulado.total_questoes, 0);
          const totalAcertos = simulados.reduce((sum: number, simulado: any) => sum + simulado.total_acertos, 0);
          const totalRespondidas = simulados.reduce((sum: number, simulado: any) => sum + simulado.total_respondidas, 0);
          const totalErros = Math.max(totalQuestoes - totalAcertos, 0);
          return {
            aluno: student.aluno,
            escola: student.escola,
            serie: student.serie,
            nivel: student.nivel,
            turma: student.turma,
            registros,
            simulados: simulados.length,
            total_questoes: totalQuestoes,
            total_acertos: totalAcertos,
            total_erros: totalErros,
            desempenho: totalQuestoes ? Number((totalAcertos / totalQuestoes).toFixed(4)) : 0,
            taxa_resposta: totalQuestoes ? Number((Math.min(totalRespondidas, totalQuestoes) / totalQuestoes).toFixed(4)) : 0,
          };
        });

        const destaque = [...rows]
          .sort((a: any, b: any) =>
            Number(b.desempenho || 0) - Number(a.desempenho || 0) ||
            Number(b.total_acertos || 0) - Number(a.total_acertos || 0) ||
            Number(b.simulados || 0) - Number(a.simulados || 0)
          )
          .slice(0, 10);
        const atencao = [...rows]
          .sort((a: any, b: any) =>
            Number(a.desempenho || 0) - Number(b.desempenho || 0) ||
            Number(b.total_erros || 0) - Number(a.total_erros || 0) ||
            Number(b.simulados || 0) - Number(a.simulados || 0)
          )
          .slice(0, 10);
        const resumoMap = new Map<string, any>();
        rows.forEach((row: any) => {
          const analysisKey = [row.aluno, row.escola, row.serie].join("|");
          const current = resumoMap.get(analysisKey) || {
            analysis_key: analysisKey,
            aluno: row.aluno,
            escola: row.escola,
            serie: row.serie,
            registros: 0,
            simulados: 0,
            total_questoes: 0,
            total_acertos: 0,
            total_erros: 0,
          };
          current.registros += row.registros;
          current.simulados += row.simulados;
          current.total_questoes += row.total_questoes;
          current.total_acertos += row.total_acertos;
          current.total_erros += row.total_erros;
          resumoMap.set(analysisKey, current);
        });
        const resumos = Array.from(resumoMap.values()).map((row: any) => ({
          ...row,
          desempenho: row.total_questoes ? Number((row.total_acertos / row.total_questoes).toFixed(4)) : 0,
          taxa_acerto: row.total_questoes ? Number((row.total_acertos / row.total_questoes).toFixed(4)) : 0,
          taxa_erro: row.total_questoes ? Number((row.total_erros / row.total_questoes).toFixed(4)) : 0,
        }));

        return { rows, destaque, atencao, resumos };
      };
      const normalizedDisciplineExpr = `
        CASE
          WHEN UPPER(TRIM(DISCIPLINA)) IN ('LINGUAGEM', 'LINGUAGENS', 'LINGUAGENS E CODIGOS', 'LINGUAGENS E CÓDIGOS', 'LINGUAGEM E COMUNICAÇÕES') THEN 'LINGUAGENS'
          WHEN UPPER(TRIM(DISCIPLINA)) IN ('MATEMATICA', 'MATEMÁTICA', 'MATEMATICA E SUAS TECNOLOGIAS', 'MATEMÁTICA E SUAS TECNOLOGIAS') THEN 'MATEMÁTICA'
          WHEN UPPER(TRIM(DISCIPLINA)) IN ('HUMANAS', 'CIENCIAS HUMANAS', 'CIÊNCIAS HUMANAS', 'HUMANAS E SUAS TECNOLOGIAS', 'CIÊNCIAS HUMANAS E SUAS TECNOLOGIAS') THEN 'CIÊNCIAS HUMANAS'
          WHEN UPPER(TRIM(DISCIPLINA)) IN ('NATUREZA', 'CIENCIAS DA NATUREZA', 'CIÊNCIAS DA NATUREZA', 'NATUREZA E SUAS TECNOLOGIAS', 'CIÊNCIAS DA NATUREZA E SUAS TECNOLOGIAS') THEN 'CIÊNCIAS DA NATUREZA'
          ELSE TRIM(DISCIPLINA)
        END
      `;

      const [
        [overviewRows],
        [filterSchools],
        [filterUnions],
        [filterAssociations],
        [filterYears],
        [filterBimestres],
        [filterNiveis],
        [filterSeries],
        [filterTurmas],
        [disciplinaRows],
        [schoolTopRows],
        [schoolCriticalRows],
        [serieRows],
        [habilidadeRows],
        [dificuldadeRows],
        [simuladoRows],
        [timelineRows],
        [tableCountRows],
        [questaoOverviewRows],
        [uniaoRows],
        [associacaoRows],
      ]: any = await Promise.all([
        pool.query(
          `SELECT
              COUNT(*) as registros,
              COUNT(DISTINCT ESCOLA) as escolas,
              COUNT(DISTINCT ID_SIMULADO) as simulados,
              COUNT(DISTINCT SERIE) as series,
              COUNT(DISTINCT DISCIPLINA) as disciplinas,
              COUNT(DISTINCT ID_QUESTAO) as questoes_distintas,
              ROUND(AVG(ACERTOS), 4) as acertos_medio,
              ROUND(1 - AVG(ACERTOS), 4) as erros_medio,
              ROUND(AVG(ACERTOS), 4) as desempenho_medio,
              ROUND(AVG(ACERTOS), 4) as taxa_acerto,
              ROUND(1 - AVG(ACERTOS), 4) as taxa_erro,
              ROUND(AVG(A), 2) as media_a,
              ROUND(AVG(B), 2) as media_b,
              ROUND(AVG(C), 2) as media_c,
              ROUND(AVG(D), 2) as media_d,
              ROUND(AVG(E), 2) as media_e,
              MIN(data_insercao) as primeira_aplicacao,
              MAX(data_insercao) as ultima_aplicacao,
              MAX(data_insercao) as ultima_carga
           FROM questao_simulado
           ${questaoWhere}`,
          questaoParams,
        ),
        pool.query(
          `SELECT DISTINCT ESCOLA as escola
           FROM alunos_simulados
           WHERE ESCOLA IS NOT NULL AND ESCOLA <> ''
           ORDER BY ESCOLA`,
        ),
        pool.query(
          schoolTable
            ? `SELECT DISTINCT ${uniaoValueExpr} as uniao
               FROM ${schoolTable} ep
               WHERE ${uniaoValueExpr} IS NOT NULL AND ${uniaoValueExpr} <> ''
               ORDER BY uniao`
            : `SELECT NULL as uniao WHERE 1 = 0`,
        ),
        pool.query(
          schoolTable
            ? `SELECT DISTINCT ${associacaoValueExpr} as associacao
               FROM ${schoolTable} ep
               WHERE ${associacaoValueExpr} IS NOT NULL AND ${associacaoValueExpr} <> ''
               ORDER BY associacao`
            : `SELECT NULL as associacao WHERE 1 = 0`,
        ),
        pool.query(
          `SELECT DISTINCT ANO as ano
           FROM alunos_simulados
           WHERE ANO IS NOT NULL
           ORDER BY ANO DESC`,
        ),
        pool.query(
          `SELECT DISTINCT BIMESTRE as bimestre
           FROM alunos_simulados
           WHERE BIMESTRE IS NOT NULL AND BIMESTRE <> ''
           ORDER BY BIMESTRE`,
        ),
        pool.query(
          `SELECT DISTINCT NIVEL as nivel
           FROM alunos_simulados
           WHERE NIVEL IS NOT NULL AND NIVEL <> ''
           ORDER BY NIVEL`,
        ),
        pool.query(
          `SELECT DISTINCT SERIE as serie
           FROM alunos_simulados
           WHERE SERIE IS NOT NULL AND SERIE <> ''
           ORDER BY SERIE`,
        ),
        pool.query(
          `SELECT DISTINCT TURMA as turma
           FROM alunos_simulados
           WHERE TURMA IS NOT NULL AND TURMA <> ''
           ORDER BY TURMA`,
        ),
        pool.query(
          `SELECT
              ${normalizedDisciplineExpr} as disciplina,
              COUNT(*) as registros,
              COUNT(DISTINCT PARTICIPANTE) as participantes,
              ${studentQuestionsExpr} as total_questoes,
              ${studentHitsExpr} as acertos,
              ${studentPerformanceExpr} as desempenho
           FROM alunos_simulados
           ${alunoWhere}
           ${alunoWhere ? "AND" : "WHERE"} DISCIPLINA IS NOT NULL
             AND DISCIPLINA <> ''
             AND UPPER(DISCIPLINA) NOT LIKE '%BIMESTRE%'
             AND UPPER(DISCIPLINA) <> 'TODOS OS DESCRITORES'
             AND DISCIPLINA NOT REGEXP '^[0-9]{4}(\\.[0-9]+)?$'
           GROUP BY ${normalizedDisciplineExpr}
           ORDER BY desempenho DESC`,
          alunoParams,
        ),
        pool.query(
          `SELECT
              ESCOLA as escola,
              COUNT(*) as registros,
              COUNT(DISTINCT PARTICIPANTE) as participantes,
              COUNT(DISTINCT ID_SIMULADO) as simulados,
              ${studentQuestionsExpr} as total_questoes,
              ${studentHitsExpr} as total_acertos,
              ${studentPerformanceExpr} as desempenho,
              LEAST(ROUND(${studentResponseExpr} / NULLIF(${studentQuestionsExpr}, 0), 4), 1) as taxa_resposta
           FROM alunos_simulados
           ${alunoWhere}
           ${alunoWhere ? "AND" : "WHERE"} ESCOLA IS NOT NULL AND ESCOLA <> ''
           GROUP BY ESCOLA
           ORDER BY desempenho DESC`,
          alunoParams,
        ),
        pool.query(
          `SELECT
              ESCOLA as escola,
              COUNT(*) as registros,
              COUNT(DISTINCT PARTICIPANTE) as participantes,
              COUNT(DISTINCT ID_SIMULADO) as simulados,
              ${studentQuestionsExpr} as total_questoes,
              ${studentHitsExpr} as total_acertos,
              ${studentPerformanceExpr} as desempenho,
              LEAST(ROUND(${studentResponseExpr} / NULLIF(${studentQuestionsExpr}, 0), 4), 1) as taxa_resposta
           FROM alunos_simulados
           ${alunoWhere}
           ${alunoWhere ? "AND" : "WHERE"} ESCOLA IS NOT NULL AND ESCOLA <> ''
           GROUP BY ESCOLA
           HAVING registros >= 50
           ORDER BY desempenho DESC`,
          alunoParams,
        ),
        pool.query(
          `SELECT
              SERIE as serie,
              NIVEL as nivel,
              COUNT(*) as registros,
              COUNT(DISTINCT PARTICIPANTE) as participantes,
              ${studentQuestionsExpr} as total_questoes,
              ${studentHitsExpr} as total_acertos,
              ${studentPerformanceExpr} as desempenho
           FROM alunos_simulados
           ${alunoWhere}
           ${alunoWhere ? "AND" : "WHERE"} SERIE IS NOT NULL AND SERIE <> ''
           GROUP BY SERIE, NIVEL
           ORDER BY desempenho DESC`,
          alunoParams,
        ),
        pool.query(
          `SELECT
              COALESCE(qs.HABILIDADE, ms.HABILIDADE) as habilidade,
              qs.DISCIPLINA as disciplina,
              qs.DIFICULDADE as dificuldade,
              COUNT(*) as questoes,
              COUNT(DISTINCT qs.ID_QUESTAO) as questoes_distintas,
              ROUND(AVG(qs.ACERTOS), 4) as acertos_medio,
              ROUND(1 - AVG(qs.ACERTOS), 4) as erros_medio
           FROM questao_simulado qs
           LEFT JOIN mapa_simulados ms
             ON ms.ID_SIMULADO = qs.ID_SIMULADO
            AND ms.ID_QUESTAO = qs.ID_QUESTAO
            AND ms.ESCOLA = qs.ESCOLA
           ${prefixedQuestaoWhere}
           ${prefixedQuestaoWhere ? "AND" : "WHERE"} COALESCE(qs.HABILIDADE, ms.HABILIDADE) IS NOT NULL AND COALESCE(qs.HABILIDADE, ms.HABILIDADE) <> '' AND COALESCE(qs.HABILIDADE, ms.HABILIDADE) <> '-' AND qs.ACERTOS IS NOT NULL
           GROUP BY COALESCE(qs.HABILIDADE, ms.HABILIDADE), qs.DISCIPLINA, qs.DIFICULDADE
           HAVING questoes >= 3
           ORDER BY acertos_medio DESC
           LIMIT 50`,
          questaoParams,
        ),
        pool.query(
          `SELECT
              DIFICULDADE as dificuldade,
              DISCIPLINA as disciplina,
              COUNT(*) as questoes,
              ROUND(AVG(ACERTOS), 4) as acertos_medio,
              ROUND(1 - AVG(ACERTOS), 4) as erros_medio
           FROM questao_simulado
           ${questaoWhere}
           ${questaoWhere ? "AND" : "WHERE"} DIFICULDADE IS NOT NULL AND DIFICULDADE <> '' AND ACERTOS IS NOT NULL
           GROUP BY DIFICULDADE, DISCIPLINA
           ORDER BY acertos_medio DESC`,
          questaoParams,
        ),
        pool.query(
          `SELECT
              ID_SIMULADO as id_simulado,
              NOME_COMPLETO_SIMULADO as nome,
              COUNT(*) as registros,
              COUNT(DISTINCT ESCOLA) as escolas,
              ${studentQuestionsExpr} as total_questoes,
              ${studentHitsExpr} as total_acertos,
              ${studentPerformanceExpr} as desempenho
           FROM alunos_simulados
           ${alunoWhere}
           GROUP BY ID_SIMULADO, NOME_COMPLETO_SIMULADO
           ORDER BY registros DESC`,
          alunoParams,
        ),
        pool.query(
          `SELECT
              CONCAT(ANO, ' - ', BIMESTRE) as periodo,
              ANO as ano,
              BIMESTRE as bimestre,
              COUNT(*) as registros,
              COUNT(DISTINCT PARTICIPANTE) as participantes,
              ${studentQuestionsExpr} as total_questoes,
              ${studentHitsExpr} as total_acertos,
              ${studentPerformanceExpr} as desempenho
           FROM alunos_simulados
           ${alunoWhere}
           ${alunoWhere ? "AND" : "WHERE"} ANO IS NOT NULL AND BIMESTRE IS NOT NULL AND BIMESTRE <> ''
           GROUP BY ANO, BIMESTRE
           ORDER BY ANO, MIN(CAST(REGEXP_SUBSTR(BIMESTRE, '[0-9]+') AS UNSIGNED)), BIMESTRE`,
          alunoParams,
        ),
        pool.query(
          `SELECT table_name as tabela, table_rows as linhas_estimadas
           FROM information_schema.tables
           WHERE table_schema = DATABASE()
             AND table_name IN ('alunos_simulados', 'mapa_simulados', 'questao', 'questao_simulado')
           ORDER BY table_name`,
        ),
        pool.query(
          `SELECT
              (SELECT COUNT(*) FROM questao ${availableTables.has("questao") ? "" : ""}) as banco_questoes,
              (SELECT COUNT(*) FROM mapa_simulados ${mapaWhere}) as questoes_mapeadas,
              (SELECT COUNT(*) FROM questao_simulado ${questaoWhere}) as questoes_aplicadas,
              (SELECT COUNT(DISTINCT ID_QUESTAO) FROM questao_simulado ${questaoWhere}) as questoes_distintas`,
          [...mapaParams, ...questaoParams, ...questaoParams],
        ),
        pool.query(
          schoolTable
            ? `SELECT
                ${uniaoValueExpr} as uniao,
                MAX(ep.UNIAO) as uniao_nome,
                SUM(a.registros) as registros,
                SUM(a.participantes) as participantes,
                COUNT(DISTINCT a.escola) as escolas,
                ROUND(SUM(a.total_acertos) / NULLIF(SUM(a.total_questoes), 0), 4) as desempenho
             FROM (
               SELECT
                  a.ESCOLA as escola,
                  COUNT(*) as registros,
                  COUNT(DISTINCT a.PARTICIPANTE) as participantes,
                  ${studentQuestionsExpr} as total_questoes,
                  ${studentHitsExpr} as total_acertos
               FROM alunos_simulados a
               ${schoolAggWhere}
               GROUP BY a.ESCOLA
             ) a
             INNER JOIN ${schoolTable} ep
               ON ${schoolJoinExpr}
             WHERE ${uniaoValueExpr} IS NOT NULL AND ${uniaoValueExpr} <> ''
             GROUP BY ${uniaoValueExpr}
             ORDER BY desempenho DESC`
            : `SELECT NULL as uniao, 0 as registros, 0 as participantes, 0 as escolas, 0 as desempenho WHERE 1 = 0`,
          alunoParams,
        ),
        pool.query(
          schoolTable
            ? `SELECT
                ${associacaoValueExpr} as associacao,
                MAX(ep.ASSOCIACAO) as associacao_nome,
                ${uniaoValueExpr} as uniao,
                MAX(ep.UNIAO) as uniao_nome,
                SUM(a.registros) as registros,
                SUM(a.participantes) as participantes,
                COUNT(DISTINCT a.escola) as escolas,
                ROUND(SUM(a.total_acertos) / NULLIF(SUM(a.total_questoes), 0), 4) as desempenho
             FROM (
               SELECT
                  a.ESCOLA as escola,
                  COUNT(*) as registros,
                  COUNT(DISTINCT a.PARTICIPANTE) as participantes,
                  ${studentQuestionsExpr} as total_questoes,
                  ${studentHitsExpr} as total_acertos
               FROM alunos_simulados a
               ${schoolAggWhere}
               GROUP BY a.ESCOLA
             ) a
             INNER JOIN ${schoolTable} ep
               ON ${schoolJoinExpr}
             WHERE ${associacaoValueExpr} IS NOT NULL AND ${associacaoValueExpr} <> ''
             GROUP BY ${associacaoValueExpr}, ${uniaoValueExpr}
             ORDER BY desempenho DESC`
            : `SELECT NULL as associacao, NULL as uniao, 0 as registros, 0 as participantes, 0 as escolas, 0 as desempenho WHERE 1 = 0`,
          alunoParams,
        ),
      ]);

      const [studentOverviewRows]: any = await pool.query(
        `SELECT
            COUNT(*) as registros_alunos,
            COUNT(DISTINCT PARTICIPANTE) as participantes,
            ${studentPerformanceExpr} as desempenho_alunos,
            ${studentQuestionsExpr} as questoes_previstas_alunos,
            ${studentResponseExpr} as questoes_respondidas_alunos,
            LEAST(ROUND(${studentResponseExpr} / NULLIF(${studentQuestionsExpr}, 0), 4), 1) as taxa_resposta,
            GROUP_CONCAT(DISTINCT ANO ORDER BY ANO SEPARATOR ', ') as anos_analisados,
            MIN(DATA_INICIO) as primeira_aplicacao,
            MAX(DATA_FIM) as ultima_aplicacao
         FROM alunos_simulados
         ${alunoWhere}`,
        alunoParams,
      );

      const [acertosPorDisciplinaRows]: any = await pool.query(
        `SELECT
            ${normalizedDisciplineExpr} as disciplina,
            COUNT(*) as questoes,
            COUNT(DISTINCT ID_QUESTAO) as questoes_distintas,
            COUNT(DISTINCT ESCOLA) as escolas,
            ROUND(AVG(ACERTOS), 4) as desempenho,
            ROUND(1 - AVG(ACERTOS), 4) as erro_medio,
            ROUND(AVG(A), 2) as media_a,
            ROUND(AVG(B), 2) as media_b,
            ROUND(AVG(C), 2) as media_c,
            ROUND(AVG(D), 2) as media_d,
            ROUND(AVG(E), 2) as media_e
         FROM questao_simulado
         ${questaoWhere}
         ${questaoWhere ? "AND" : "WHERE"} DISCIPLINA IS NOT NULL AND DISCIPLINA <> '' AND ACERTOS IS NOT NULL
         GROUP BY ${normalizedDisciplineExpr}
         ORDER BY desempenho DESC`,
        questaoParams,
      );

      const [timelineAnoRows]: any = await pool.query(
        `SELECT
            CAST(ANO AS CHAR) as periodo,
            ANO as ano,
            NULL as bimestre,
            COUNT(*) as registros,
            COUNT(DISTINCT PARTICIPANTE) as participantes,
            ${studentQuestionsExpr} as total_questoes,
            ${studentHitsExpr} as total_acertos,
            ${studentPerformanceExpr} as desempenho
         FROM alunos_simulados
         ${alunoWhere}
         ${alunoWhere ? "AND" : "WHERE"} ANO IS NOT NULL
         GROUP BY ANO
         ORDER BY ANO`,
        alunoParams,
      );

      const [timelineBimestreRows]: any = await pool.query(
        `SELECT
            BIMESTRE as periodo,
            NULL as ano,
            BIMESTRE as bimestre,
            COUNT(*) as registros,
            COUNT(DISTINCT PARTICIPANTE) as participantes,
            ${studentQuestionsExpr} as total_questoes,
            ${studentHitsExpr} as total_acertos,
            ${studentPerformanceExpr} as desempenho
         FROM alunos_simulados
         ${alunoWhere}
         ${alunoWhere ? "AND" : "WHERE"} BIMESTRE IS NOT NULL AND BIMESTRE <> ''
         GROUP BY BIMESTRE
         ORDER BY MIN(CAST(REGEXP_SUBSTR(BIMESTRE, '[0-9]+') AS UNSIGNED)), BIMESTRE`,
        alunoParams,
      );

      const [rankSerieRows]: any = await pool.query(
        `SELECT
            SERIE as grupo,
            'Série' as tipo,
            SERIE as serie,
            NULL as turma,
            NULL as nivel,
            COUNT(*) as registros,
            COUNT(DISTINCT PARTICIPANTE) as participantes,
            COUNT(DISTINCT ID_SIMULADO) as simulados,
            ${studentQuestionsExpr} as total_questoes,
            ${studentHitsExpr} as total_acertos,
            ${studentPerformanceExpr} as desempenho
         FROM alunos_simulados
         ${alunoWhere}
         ${alunoWhere ? "AND" : "WHERE"} SERIE IS NOT NULL AND SERIE <> ''
         GROUP BY SERIE
         ORDER BY desempenho DESC
         LIMIT 50`,
        alunoParams,
      );

      const [rankTurmaRows]: any = await pool.query(
        `SELECT
            TURMA as grupo,
            'Turma' as tipo,
            NULL as serie,
            TURMA as turma,
            NULL as nivel,
            COUNT(*) as registros,
            COUNT(DISTINCT PARTICIPANTE) as participantes,
            COUNT(DISTINCT ID_SIMULADO) as simulados,
            ${studentQuestionsExpr} as total_questoes,
            ${studentHitsExpr} as total_acertos,
            ${studentPerformanceExpr} as desempenho
         FROM alunos_simulados
         ${alunoWhere}
         ${alunoWhere ? "AND" : "WHERE"} TURMA IS NOT NULL AND TURMA <> ''
         GROUP BY TURMA
         ORDER BY desempenho DESC
         LIMIT 50`,
        alunoParams,
      );

      const [rankNivelRows]: any = await pool.query(
        `SELECT
            NIVEL as grupo,
            'Nível' as tipo,
            NULL as serie,
            NULL as turma,
            NIVEL as nivel,
            COUNT(*) as registros,
            COUNT(DISTINCT PARTICIPANTE) as participantes,
            COUNT(DISTINCT ID_SIMULADO) as simulados,
            ${studentQuestionsExpr} as total_questoes,
            ${studentHitsExpr} as total_acertos,
            ${studentPerformanceExpr} as desempenho
         FROM alunos_simulados
         ${alunoWhere}
         ${alunoWhere ? "AND" : "WHERE"} NIVEL IS NOT NULL AND NIVEL <> ''
         GROUP BY NIVEL
         ORDER BY desempenho DESC
         LIMIT 50`,
        alunoParams,
      );

      const studentRankData = await buildStudentRankingRows();
      const rankCombinadoMap = new Map<string, any>();
      studentRankData.rows.forEach((row: any) => {
        if (!row.nivel && !row.serie && !row.turma) return;
        const key = [row.nivel || "", row.serie || "", row.turma || ""].join("|");
        const current = rankCombinadoMap.get(key) || {
          grupo: [row.nivel, row.serie, row.turma].filter(Boolean).join(" • "),
          tipo: "Nível/Série/Turma",
          serie: row.serie || null,
          turma: row.turma || null,
          nivel: row.nivel || null,
          registros: 0,
          participantesSet: new Set<string>(),
          simulados: 0,
          total_questoes: 0,
          total_acertos: 0,
        };
        current.registros += Number(row.registros || 0);
        current.participantesSet.add([row.aluno, row.escola, row.serie, row.nivel, row.turma].join("|"));
        current.simulados += Number(row.simulados || 0);
        current.total_questoes += Number(row.total_questoes || 0);
        current.total_acertos += Number(row.total_acertos || 0);
        rankCombinadoMap.set(key, current);
      });
      const rankCombinadoRows = Array.from(rankCombinadoMap.values())
        .map((row: any) => ({
          ...row,
          participantes: row.participantesSet.size,
          desempenho: row.total_questoes ? Number((row.total_acertos / row.total_questoes).toFixed(4)) : 0,
          participantesSet: undefined,
        }))
        .sort((a: any, b: any) => Number(b.desempenho || 0) - Number(a.desempenho || 0))
        .slice(0, 80);

      const [tabelaDetalhadaRows]: any = await pool.query(
        `SELECT
            ANO as ano,
            BIMESTRE as bimestre,
            ESCOLA as escola,
            SERIE as serie,
            NIVEL as nivel,
            TURMA as turma,
            ID_SIMULADO as id_simulado,
            PARTICIPANTE as aluno,
            ROUND(LEAST(GREATEST(COALESCE(DESEMPENHO, 0), 0), 1), 4) as desempenho
         FROM alunos_simulados
         ${alunoWhere}
         ORDER BY ANO DESC, CAST(REGEXP_SUBSTR(BIMESTRE, '[0-9]+') AS UNSIGNED) DESC, ESCOLA, SERIE, TURMA, PARTICIPANTE
         LIMIT 2000`,
        alunoParams,
      );

      const alunosDestaqueRows = studentRankData.destaque;
      const alunosAtencaoRows = studentRankData.atencao;

      const alunosSelecionados = Array.from(
        new Set([...alunosDestaqueRows, ...alunosAtencaoRows].map((row: any) => row.aluno).filter(Boolean)),
      );
      const alunoAnalises: Record<string, any> = {};

      if (alunosSelecionados.length) {
        const alunoResumoRows = studentRankData.resumos.filter((row: any) => alunosSelecionados.includes(row.aluno));

        const [alunoHabilidadeRows]: any = await pool.query(
          `SELECT
              ${studentAnalysisKeyExpr("a.PARTICIPANTE", "a.ESCOLA", "a.SERIE")} as analysis_key,
              a.PARTICIPANTE as aluno,
              a.ESCOLA as escola,
              a.SERIE as serie,
              COALESCE(qs.HABILIDADE, ms.HABILIDADE) as habilidade,
              qs.DISCIPLINA as disciplina,
              qs.DIFICULDADE as dificuldade,
              COUNT(*) as questoes,
              COUNT(DISTINCT qs.ID_QUESTAO) as questoes_distintas,
              ROUND(AVG(LEAST(GREATEST(COALESCE(a.DESEMPENHO, 0), 0), 1)), 4) as acertos_medio,
              ROUND(1 - AVG(LEAST(GREATEST(COALESCE(a.DESEMPENHO, 0), 0), 1)), 4) as erros_medio
           FROM alunos_simulados a
           INNER JOIN questao_simulado qs
             ON qs.ESCOLA = a.ESCOLA
            AND qs.ID_SIMULADO = a.ID_SIMULADO
            AND (qs.SERIE = a.SERIE OR qs.SERIE IS NULL OR qs.SERIE = '' OR a.SERIE IS NULL OR a.SERIE = '')
            AND (qs.DISCIPLINA = a.DISCIPLINA OR a.DISCIPLINA IS NULL OR a.DISCIPLINA = '')
           LEFT JOIN mapa_simulados ms
             ON ms.ID_SIMULADO = qs.ID_SIMULADO
            AND ms.ID_QUESTAO = qs.ID_QUESTAO
            AND ms.ESCOLA = qs.ESCOLA
           ${alunoAliasWhere}
           ${alunoAliasWhere ? "AND" : "WHERE"} a.PARTICIPANTE IN (?) AND COALESCE(qs.HABILIDADE, ms.HABILIDADE) IS NOT NULL AND COALESCE(qs.HABILIDADE, ms.HABILIDADE) <> '' AND COALESCE(qs.HABILIDADE, ms.HABILIDADE) <> '-'
           GROUP BY ${studentAnalysisKeyExpr("a.PARTICIPANTE", "a.ESCOLA", "a.SERIE")}, a.PARTICIPANTE, a.ESCOLA, a.SERIE, COALESCE(qs.HABILIDADE, ms.HABILIDADE), qs.DISCIPLINA, qs.DIFICULDADE
           HAVING questoes >= 1
           ORDER BY erros_medio DESC, questoes DESC
           LIMIT 200`,
          [...alunoParams, alunosSelecionados],
        );

        alunoResumoRows.forEach((row: any) => {
          alunoAnalises[row.analysis_key] = { resumo: row, habilidades: [] };
        });
        aggregateSkillRows(alunoHabilidadeRows, true).forEach((row: any) => {
          if (!alunoAnalises[row.analysis_key]) alunoAnalises[row.analysis_key] = { resumo: null, habilidades: [] };
          alunoAnalises[row.analysis_key].habilidades.push(row);
        });
      }

      const questoesCriticasRows: any[] = [];

      return {
        success: true,
        availableTables: Array.from(availableTables) as string[],
        filters: {
          unioes: filterUnions.map((row: any) => row.uniao),
          associacoes: filterAssociations.map((row: any) => row.associacao),
          escolas: filterSchools.map((row: any) => row.escola),
          anos: filterYears.map((row: any) => row.ano),
          bimestres: filterBimestres.map((row: any) => row.bimestre),
          niveis: filterNiveis.map((row: any) => row.nivel),
          series: filterSeries.map((row: any) => row.serie),
          turmas: filterTurmas.map((row: any) => row.turma),
        },
        overview: { ...(overviewRows[0] || {}), ...(studentOverviewRows[0] || {}) },
        disciplinas: disciplinaRows,
        acertosPorDisciplina: acertosPorDisciplinaRows,
        escolasTop: schoolTopRows,
        escolasCriticas: schoolCriticalRows,
        series: serieRows,
        alunosDestaque: alunosDestaqueRows,
        alunosAtencao: alunosAtencaoRows,
        alunoAnalises,
        questoesCriticas: questoesCriticasRows,
        habilidadesCriticas: aggregateSkillRows(habilidadeRows),
        dificuldade: dificuldadeRows,
        simulados: simuladoRows,
        timeline: timelineRows,
        timelineAno: timelineAnoRows,
        timelineBimestre: timelineBimestreRows,
        timelineAnoBimestre: timelineRows,
        rankSerie: rankSerieRows,
        rankTurma: rankTurmaRows,
        rankNivel: rankNivelRows,
        rankCombinado: rankCombinadoRows,
        tabelaDetalhada: tabelaDetalhadaRows,
        unioes: uniaoRows,
        associacoes: associacaoRows,
        tableCounts: tableCountRows,
        questoes: questaoOverviewRows[0] || {},
      };
    } catch (error: any) {
      console.error("Reports Analytics Error:", error);
      return { success: false, error: error.message };
    }
  });

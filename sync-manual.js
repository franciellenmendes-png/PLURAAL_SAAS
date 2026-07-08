import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Parse .env manually since we're running raw node
const envRaw = fs.readFileSync('.env', 'utf-8');
const env = {};
envRaw.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length > 0 && !key.startsWith('#')) {
    env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '');
  }
});

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

async function runSync(config, dbName) {
  console.log(`[SYNC] Conectando ao banco ${dbName}...`);
  try {
    const connection = await mysql.createConnection(config);
    const queries = schemaSQL.split(';').filter(q => q.trim().length > 0);
    
    for (const q of queries) {
      await connection.query(q);
    }
    
    // Inserir Admin
    await connection.query(`
      INSERT IGNORE INTO usuarios (usuario, nome_user, email_user, senha, associacao_uniao, nivel, primeiro_acesso)
      VALUES ('KAREN', 'Karen Xavier', 'KARENALIXAVI@GMAIL.COM', 'MUDAR@123', 'GERAL', 'admin', TRUE)
    `);
    
    await connection.end();
    console.log(`[SYNC] Banco ${dbName} sincronizado com sucesso!`);
  } catch (error) {
    console.error(`[ERRO NO BANCO ${dbName}]:`, error.message);
  }
}

async function main() {
  await runSync({
    host: env.LOCAL_HOST,
    port: Number(env.LOCAL_PORT) || 3306,
    database: env.LOCAL_DB,
    user: env.LOCAL_USER,
    password: env.LOCAL_PASSWORD,
  }, "Local");

  await runSync({
    host: env.CLOUD_HOST,
    port: Number(env.CLOUD_PORT) || 4000,
    database: env.CLOUD_DB,
    user: env.CLOUD_USER,
    password: env.CLOUD_PASSWORD,
    ssl: { rejectUnauthorized: true }
  }, "Nuvem (TiDB)");
}

main();

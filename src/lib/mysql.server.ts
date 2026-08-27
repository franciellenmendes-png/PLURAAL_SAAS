import mysql from 'mysql2/promise';

function getDbConfig() {
  const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (uri) {
    return {
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 30000,
    };
  }

  const host =
    process.env.MYSQL_HOST ||
    process.env.MYSQLHOST ||
    process.env.RAILWAY_HOST ||
    process.env.CLOUD_HOST ||
    'caboose.proxy.rlwy.net';

  const port = Number(
    process.env.MYSQL_PORT ||
    process.env.MYSQLPORT ||
    process.env.RAILWAY_PORT ||
    process.env.CLOUD_PORT ||
    12070
  );

  const database =
    process.env.MYSQL_DATABASE ||
    process.env.MYSQLDATABASE ||
    process.env.MYSQL_DB ||
    process.env.RAILWAY_DB ||
    process.env.CLOUD_DB ||
    'railway';

  const user =
    process.env.MYSQL_USER ||
    process.env.MYSQLUSER ||
    process.env.RAILWAY_USER ||
    process.env.CLOUD_USER ||
    'root';

  const password =
    process.env.MYSQL_PASSWORD ||
    process.env.MYSQLPASSWORD ||
    process.env.RAILWAY_PASSWORD ||
    process.env.CLOUD_PASSWORD ||
    'WeDgLYsmhnnIdOltLqWNflkQZGvejEGc';

  return {
    host,
    port,
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 30000,
  };
}

const dbConfig: any = getDbConfig();

const pool = mysql.createPool(dbConfig);

export default pool;

import mysql from 'mysql2/promise';

function getDbConfig() {
  const isCloud = process.env.DB_MODE === 'cloud' || !!process.env.RAILWAY_HOST || !!process.env.MYSQL_HOST || !!process.env.MYSQLHOST || !!process.env.MYSQL_URL || !!process.env.DATABASE_URL;

  if (process.env.MYSQL_URL || process.env.DATABASE_URL) {
    const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
    return {
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 30000,
      ssl: isCloud ? { rejectUnauthorized: false } : undefined,
    };
  }

  const host =
    process.env.MYSQL_HOST ||
    process.env.MYSQLHOST ||
    process.env.RAILWAY_HOST ||
    (isCloud ? process.env.CLOUD_HOST : process.env.LOCAL_HOST) ||
    'caboose.proxy.rlwy.net';

  const port = Number(
    process.env.MYSQL_PORT ||
    process.env.MYSQLPORT ||
    process.env.RAILWAY_PORT ||
    (isCloud ? process.env.CLOUD_PORT : process.env.LOCAL_PORT) ||
    12070
  );

  const database =
    process.env.MYSQL_DATABASE ||
    process.env.MYSQLDATABASE ||
    process.env.MYSQL_DB ||
    process.env.RAILWAY_DB ||
    (isCloud ? process.env.CLOUD_DB : process.env.LOCAL_DB) ||
    'railway';

  const user =
    process.env.MYSQL_USER ||
    process.env.MYSQLUSER ||
    process.env.RAILWAY_USER ||
    (isCloud ? process.env.CLOUD_USER : process.env.LOCAL_USER) ||
    'root';

  const password =
    process.env.MYSQL_PASSWORD ||
    process.env.MYSQLPASSWORD ||
    process.env.RAILWAY_PASSWORD ||
    (isCloud ? process.env.CLOUD_PASSWORD : process.env.LOCAL_PASSWORD) ||
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
    ssl: (isCloud && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('192.168.')) ? { rejectUnauthorized: false } : undefined
  };
}

const dbConfig: any = getDbConfig();

const pool = mysql.createPool(dbConfig);

export default pool;

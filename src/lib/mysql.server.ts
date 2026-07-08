import mysql from 'mysql2/promise';

const isCloud = process.env.DB_MODE === 'cloud';

const pool = mysql.createPool({
  host: isCloud ? process.env.CLOUD_HOST : process.env.LOCAL_HOST,
  port: Number(isCloud ? process.env.CLOUD_PORT : process.env.LOCAL_PORT) || 3306,
  database: isCloud ? process.env.CLOUD_DB : process.env.LOCAL_DB,
  user: isCloud ? process.env.CLOUD_USER : process.env.LOCAL_USER,
  password: isCloud ? process.env.CLOUD_PASSWORD : process.env.LOCAL_PASSWORD,
  waitForConnections: true,
  connectionLimit: isCloud ? 2 : 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 30000,
  ssl: isCloud ? { rejectUnauthorized: false } : undefined
});

export default pool;

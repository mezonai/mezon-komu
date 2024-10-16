import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import path from 'path';
config();

console.log('__dirname', __dirname)
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  synchronize: false,
  // logging: true,
  migrations: [path.join(__dirname, 'src', 'migration', '*.js')],
  subscribers: [],
});

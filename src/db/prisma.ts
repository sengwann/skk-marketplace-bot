import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is missing.");
}

const pool = new Pool({
  connectionString,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: true,
          ca: process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n"),
        }
      : undefined,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export const closeDatabase = async () => {
  await prisma.$disconnect();
  await pool.end();
};

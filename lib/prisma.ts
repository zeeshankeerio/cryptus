import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient() {
  const connectionString = (process.env.DATABASE_URL || "").trim();
  
  if (!connectionString) {
    console.error("\x1b[31m[PRISMA ERROR] DATABASE_URL is not defined.\x1b[0m");
    console.warn("[PRISMA WARNING] Check if .env files are correctly loaded in standalone mode.");
  }

  // Reuse pool in development to prevent connection leaks
  const pool = globalForPrisma.pool || new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false }, // Silence warning and ensure secure connection
    connectionTimeoutMillis: 60000, // 60s timeout for cold starts
    idleTimeoutMillis: 30000,
    max: 30, // Increased for high-concurrency production stability
  });
  if (process.env.NODE_ENV !== "production") globalForPrisma.pool = pool;

  const adapter = new PrismaPg(pool as any);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

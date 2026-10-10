import { PrismaClient } from "@prisma/client";

const neonUrl = process.env.NEON_URL || process.env.DATABASE_URL;

if (!neonUrl) {
  console.warn("[Prisma] Warning: Neither NEON_URL nor DATABASE_URL is defined in the environment.");
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: neonUrl,
    },
  },
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export default prisma;

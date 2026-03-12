import "dotenv/config";
import { prisma } from "../lib/prisma";

async function test() {
  try {
    const userCount = await prisma.user.count();
    console.log("Current Users in DB:", userCount);
    console.log("Database connection successful!");
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();

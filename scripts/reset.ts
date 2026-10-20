import { rmSync } from "node:fs";
import { databasePath, closeDatabase } from "../src/lib/db.ts";

if (process.env.NODE_ENV === "production" && process.env.QUIRE_ALLOW_RESET !== "1") {
  console.error("Refusing to reset a production database without QUIRE_ALLOW_RESET=1.");
  process.exit(1);
}
closeDatabase();
rmSync(databasePath(), { force: true });
rmSync(`${databasePath()}-wal`, { force: true });
rmSync(`${databasePath()}-shm`, { force: true });
console.log(`Removed ${databasePath()}. Run db:migrate and db:seed next.`);

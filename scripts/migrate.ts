import { migrate } from "../src/lib/db.ts";

const applied = migrate();
console.log(applied.length ? `Applied ${applied.join(", ")}` : "Migrations already current.");

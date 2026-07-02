import { readFileSync, writeFileSync } from "node:fs";

// Deriva prisma/schema.postgres.prisma a partir del schema de desarrollo
// (SQLite). Ejecutar tras cualquier cambio en prisma/schema.prisma:
//   npm run db:sync-pg
const source = readFileSync("prisma/schema.prisma", "utf8");

const header = `// ⚠️ ARCHIVO GENERADO — no editar a mano.
// Derivado de prisma/schema.prisma con: npm run db:sync-pg
`;

const postgres = source.replace(
  `provider = "sqlite"`,
  `provider = "postgresql"`,
);

if (postgres === source) {
  console.error("No se encontró el provider sqlite en prisma/schema.prisma");
  process.exit(1);
}

writeFileSync("prisma/schema.postgres.prisma", header + postgres);
console.log("prisma/schema.postgres.prisma actualizado");

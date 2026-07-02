# AppCitas — imagen de producción (PostgreSQL).
# node:22-slim (glibc): compatible con los binarios nativos de better-sqlite3
# y sin sorpresas con musl.
FROM node:22-slim AS builder
WORKDIR /app

# DATABASE_URL de compilación: solo determina que prisma generate use el
# schema de PostgreSQL; no se conecta a ninguna base de datos.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app ./

EXPOSE 3000

# Aplica las migraciones pendientes y arranca. El worker de notificaciones
# se lanza como servicio aparte con la misma imagen (ver docker-compose.yml).
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

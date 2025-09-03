# Dockerfile para NestJS (Backend) - VERSIÓN FINAL CORREGIDA

# --- Etapa 1: Construcción (Builder) ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Etapa 2: Producción ---
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# --- LA SOLUCIÓN ---
# Generamos el cliente de Prisma explícitamente en la etapa final
RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
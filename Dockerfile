# --- Etapa 1: Construcción (Builder) ---
# 👇 actualizado a Node 20 LTS
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Etapa 2: Producción ---
# 👇 actualizado también aquí
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# 👇 Aquí copiamos las plantillas de correo
COPY --from=builder /app/src/mail/templates ./src/mail/templates

# --- Generamos el cliente de Prisma explícitamente en la etapa final
RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]

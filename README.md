# Sirena Station Link - Backend

Este repositorio contiene el **backend (NestJS + Prisma + Keycloak + EMQX + Socket.IO)** del sistema **Sirena Station Link**.

---

## 🚀 Stack principal
- **NestJS** (Framework principal)
- **Prisma ORM** (conexión a PostgreSQL)
- **PostgreSQL** (base de datos)
- **Keycloak** (gestión de usuarios y roles, OIDC)
- **EMQX** (broker MQTT para sirenas IoT)
- **Socket.IO** (comunicación en tiempo real con frontend)
- **ExcelJS** (exportación de logs en Excel)

---

## 📂 Estructura principal

```
backend/
 ├─ src/
 │   ├─ app.module.ts
 │   ├─ main.ts
 │   ├─ auth/         # Integración con Keycloak (login, guards, roles)
 │   ├─ data/         # Prisma Service
 │   ├─ sirens/       # Módulo de sirenas
 │   ├─ activation-logs/ # Logs de activación (Excel export)
 │   ├─ websockets/   # Gateway en tiempo real
 │   └─ mqtt/         # Cliente MQTT (EMQX)
 ├─ prisma/
 │   ├─ schema.prisma
 ├─ package.json
 └─ README.md
```

---

## ⚙️ Variables de entorno

Ejemplo de `.env`:

```dotenv
# --- Base de datos ---
DATABASE_URL=postgresql://sirena:sirena_pass@localhost:5432/sirena_db

# --- Keycloak ---
KEYCLOAK_BASE_URL=http://localhost:8080
KEYCLOAK_REALM=alarma
KEYCLOAK_CLIENT_ID=backend-api
KEYCLOAK_CLIENT_SECRET=backend-secret

# --- EMQX ---
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_BACKEND_USER=srv-backend
MQTT_BACKEND_PASS=srv-backend-secret

# --- WebSockets ---
WS_PORT=4001
```

---

## ▶️ Ejecutar en desarrollo

```bash
# Instalar dependencias
npm install

# Generar cliente Prisma
npx prisma generate

# Levantar migraciones
npx prisma migrate dev

# Ejecutar servidor NestJS
npm run start:dev
```

El backend corre en: **http://localhost:4000/api**

---

## 🐳 Docker (pendiente)

Más adelante este backend será dockerizado junto con el stack `infra/`.

---

## ✅ Fases de desarrollo (según plan maestro)

1. Bootstrap NestJS + configuración base
2. Prisma + Postgres
3. Keycloak Integration
4. MQTT (EMQX)
5. WebSocket
6. Módulos de dominio
7. Auditoría y exportación Excel
8. Seguridad y QA

---

## 👤 Roles en el sistema
- **SUPERADMIN** → CRUD global, único que modifica `maxUsers`
- **ADMIN** → CRUD limitado a urbanización y tope de usuarios
- **GUARDIA** → Panel garita, ON/OFF sirenas y grupos
- **RESIDENTE** → Controla solo su sirena

---

## 📊 Logs de activación
- Se registran acciones (ON/OFF, AUTO-OFF, etc.)
- Exportables a Excel (`.xlsx`)
- Incluyen usuario, dispositivo, fecha/hora y resultado

---

## 🛡️ Seguridad
- Login con usuario o email vía Keycloak
- Tokens modernos (OIDC, refresh en cookie HttpOnly para web, JSON en móvil)
- Límite de sesiones por rol
- Revocación de sesiones antiguas

---

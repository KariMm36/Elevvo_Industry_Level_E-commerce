# Task 10: Enterprise E-Commerce System & Zero-Downtime Cloud Deployment (NestJS Capstone)

A production-grade, enterprise-ready E-Commerce backend built with **NestJS, Prisma ORM, PostgreSQL, Redis, Docker, and GitHub Actions CI/CD**.

This capstone project synthesizes all foundational and industry-level backend concepts into a unified, high-availability architecture.

---

## 🏗️ System Architecture

```
                               ┌────────────────────────────────┐
                               │  Client / Postman / Swagger UI │
                               │  (X-Currency, x-idempotency)   │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │   NestJS API Gateway           │
                               │ (Helmet, Throttler, Interceptor│
                               │  CurrencyPipe, ExceptionFilter)│
                               └───────────────┬────────────────┘
                                               │
  ┌──────────┬──────────┬──────────┬───────────┼───────────┬───────────┬──────────┬──────────┬──────────┐
  ▼          ▼          ▼          ▼           ▼           ▼           ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│  Auth  │ │ Users  │ │Products│ │  Cart  │ │  Orders  │ │ Returns │ │Reviews │ │Invent- │ │Event   │ │Health  │
│ (JWT+  │ │  &     │ │(Cache- │ │ (Redis/│ │($transac-│ │ &Refunds│ │(Verified││ory Audit││Worker  │ │(/health│
│ RBAC)  │ │Address │ │ Aside) │ │ Prisma)│ │tion+Idem)│ │ (Stock) │ │ Buyer) │ │  Logs  │ │(Task 8)│ │ /deep) │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬─────┘ └───┬─────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
    │          │          │          │           │           │           │          │          │          │
    └──────────┴──────────┴──────────┴───────────┼───────────┴───────────┴──────────┴──────────┴──────────┘
                                                 │
                               ┌─────────────────┴─────────────────┐
                               ▼                                   ▼
                       ┌───────────────┐                   ┌───────────────┐
                       │ PostgreSQL    │                   │ Redis Storage │
                       │ (Prisma ORM)  │                   │ (Cache/Idem/  │
                       └───────────────┘                   │  Queue/Rates) │
                                                           └───────────────┘
```

```mermaid
flowchart TD
    Client[🖥️ Client / Swagger UI] -->|HTTP Request| Gateway[⚡ NestJS API Gateway]
    Gateway --> Guard{🛡️ JWT & Roles Guard}
    
    Guard -->|Auth & Users| AuthMod[🔐 Auth & Address Book]
    Guard -->|Catalog| ProdMod[📦 Products & Cache-Aside]
    Guard -->|Cart & Checkout| OrderMod[🛒 Cart & Atomic Orders]
    Guard -->|After-Sales| ReturnMod[🔄 Returns & Reviews]
    Guard -->|Telemetry| HealthMod[📊 Deep Health Check]

    ProdMod <-->|TTL Cache & Invalidate| RedisCache[(🔴 Redis Cache)]
    OrderMod -->|Idempotency Lock| RedisIdem[(🔴 Redis Idempotency)]
    OrderMod -->|Atomic $transaction| Postgres[(🐘 PostgreSQL Database)]
    OrderMod -->|LPUSH OrderPlaced| RedisQueue[(🔴 Redis Event Queue)]

    RedisQueue -->|RPOP Async Worker| Worker[⚙️ Background Notification Worker]

    style Client fill:#3b82f6,color:#fff
    style Gateway fill:#6366f1,color:#fff
    style Guard fill:#8b5cf6,color:#fff
    style Postgres fill:#0284c7,color:#fff
    style RedisCache fill:#ef4444,color:#fff
    style RedisIdem fill:#ef4444,color:#fff
    style RedisQueue fill:#dc2626,color:#fff
    style Worker fill:#059669,color:#fff
```

---

## 🌟 Key Features & Industry Patterns

### 1. 🔐 Security & Access Control (`AuthModule`)
- **Stateless JWT Authentication**: Secure access token generation with configurable expiration (`JWT_SECRET`, `JWT_EXPIRES_IN`).
- **Role-Based Access Control (RBAC)**: Role hierarchy (`CUSTOMER` vs `ADMIN`) enforced via `@Roles()` decorator and `RolesGuard`.
- **Password Security**: Strong hashing with `bcrypt` (salt rounds = 12).
- **Distributed Rate Limiting**: Centralized API throttling using `@nestjs/throttler` (100 req/min).

### 2. 📦 High-Performance Product Catalog (`ProductsModule`, `CurrencyModule`)
- **Redis Cache-Aside Pattern**: `GET /api/v1/products` and `GET /api/v1/products/:id` queries hit Redis first, with automatic fallback to PostgreSQL and a 1-hour TTL.
- **Active Cache Invalidation**: `POST`, `PATCH`, and `DELETE` operations automatically purge all corresponding product and catalog query cache keys in Redis.
- **Dynamic Multi-Currency Support**: Pass header `X-Currency: EUR` (or `USD`, `EGP`, `SAR`) to receive dynamic price conversions powered by Redis-cached exchange rates.
- **Low-Stock Event Triggers**: Automatically detects when product stock drops below threshold and emits alert events to the Redis queue.

### 3. 🛒 Shopping Cart & Idempotent Checkout (`CartModule`, `OrdersModule`)
- **Shopping Cart**: Add, modify, and delete cart items with real-time subtotal calculations.
- **Idempotency Key Support (`x-idempotency-key`)**: Prevents duplicate orders and charges during network retries or double-clicks using Redis key locks.
- **Atomic Prisma `$transaction`**:
  1. Validates real-time inventory stock for all items.
  2. Decrements product inventory atomically.
  3. Records audit entries in the `InventoryAuditLog` table.
  4. Snapshots the customer's shipping address at checkout time.
  5. Creates the `Order` and linked `OrderItem` records.
  6. Clears the user's cart in a single atomic database operation.
- **Automatic Rollback**: Any stock shortage triggers an instant transaction rollback with a 400 Bad Request error.

### 4. 🔄 Order Lifecycle, Cancellation & Returns (`ReturnsModule`)
- **State Machine**: `PENDING` ➔ `PAID` ➔ `PROCESSING` ➔ `SHIPPED` ➔ `DELIVERED` / `CANCELLED`.
- **Atomic Cancellation**: Customers can cancel `PENDING`/`PAID` orders, automatically restoring stock to inventory inside a `$transaction`.
- **Returns & Refunds**: Customers can request returns for `DELIVERED` orders; Admin approval executes atomic stock restoration.

### 5. ⭐ Verified Buyer Reviews (`ReviewsModule`)
- Review submissions (1–5 stars + text) are strictly restricted to customers with a verified purchase record for that product.
- Automatically recalculates and updates the product's `averageRating` and `totalReviews`.

### 6. ⚡ Event-Driven Decoupled Notifications (`EventsModule` - Task 8 Synthesis)
- Upon checkout, an `OrderPlaced` event is published (`LPUSH orders:queue`) to Redis.
- A background worker consumes the event asynchronously (`RPOP`) without delaying the HTTP checkout response.

### 7. 🏆 Deep Health Telemetry Dashboard (`HealthModule` - BONUS)
- `GET /api/v1/health/deep`: Returns real-time metrics including:
  - **V8 Memory Usage**: `heapUsed`, `heapTotal`, `rss`, and memory percentage.
  - **Active PostgreSQL Health & Latency**: Measures live query response time in milliseconds.
  - **Redis Latency**: Real-time roundtrip ping latency in milliseconds.
  - **Uptime & ISO Timestamps**.

---

## 🛠️ API Reference

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register new customer account |
| `POST` | `/api/v1/auth/login` | Public | Authenticate & receive JWT token |
| `GET` | `/api/v1/products` | Public | List products (Search, Filter, Cache-Aside, Multi-Currency) |
| `GET` | `/api/v1/products/:id` | Public | Get product details with caching |
| `POST` | `/api/v1/products` | `ADMIN` | Create product (purges cache) |
| `PATCH` | `/api/v1/products/:id` | `ADMIN` | Update product (purges cache) |
| `DELETE` | `/api/v1/products/:id` | `ADMIN` | Delete product (purges cache) |
| `GET` | `/api/v1/addresses` | Authenticated | List saved shipping addresses |
| `POST` | `/api/v1/addresses` | Authenticated | Add new address |
| `PATCH` | `/api/v1/addresses/:id/default` | Authenticated | Set address as default |
| `GET` | `/api/v1/cart` | Authenticated | View shopping cart & subtotal |
| `POST` | `/api/v1/cart/items` | Authenticated | Add item to cart |
| `PATCH` | `/api/v1/cart/items/:productId` | Authenticated | Update item quantity |
| `DELETE` | `/api/v1/cart/items/:productId` | Authenticated | Remove item from cart |
| `POST` | `/api/v1/orders/checkout` | Authenticated | Idempotent atomic checkout (`$transaction`) |
| `GET` | `/api/v1/orders` | Authenticated | List current user's orders |
| `GET` | `/api/v1/orders/:id` | Authenticated | Get order details |
| `PATCH` | `/api/v1/orders/:id/status` | `ADMIN` | Update order state (`PAID`, `SHIPPED`, etc.) |
| `DELETE` | `/api/v1/orders/:id/cancel` | Authenticated | Cancel order & restore inventory stock |
| `POST` | `/api/v1/orders/:orderId/returns` | Authenticated | Request return on delivered order |
| `PATCH` | `/api/v1/returns/:id/resolve` | `ADMIN` | Approve/Reject return & restore stock |
| `POST` | `/api/v1/products/:id/reviews` | Authenticated | Submit verified-buyer review |
| `GET` | `/api/v1/products/:id/reviews` | Public | View reviews for product |
| `GET` | `/api/v1/health` | Public | Basic liveness probe |
| `GET` | `/api/v1/health/deep` | `ADMIN` | **Bonus**: Deep telemetry (V8 memory, DB, Redis latency) |
| `GET` | `/api/docs` | Public | **Interactive Swagger / OpenAPI Documentation** |

---

## 🚀 Running the Application

### Option A: Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env` and configure PostgreSQL and Redis connection strings:
   ```bash
   cp .env.example .env
   ```

3. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

4. **Run Development Server**:
   ```bash
   npm run start:dev
   ```
   - API: `http://localhost:3000`
   - Swagger UI: `http://localhost:3000/api/docs`

---

### Option B: Docker Compose (Zero-Config Full Stack)

Run the entire system (NestJS API + PostgreSQL 16 + Redis 7) in one command:

```bash
docker compose up --build
```

---

## 🧪 Testing & CI/CD Pipeline

### Run Unit & E2E Tests
```bash
npm run test
npm run test:e2e
```

### GitHub Actions Automated CI/CD Pipeline (`.github/workflows/ci.yml`)
The pipeline runs automatically on every push and pull request to `main`:

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│ 🔍 1. Lint &    │ ──> │ 🧪 2. Automated  │ ──> │ 🐳 3. Multi-Stage│ ──> │ 🚀 4. Zero-       │
│    TypeCheck    │     │    Test Suites   │     │    Docker Build  │     │    Downtime Deploy│
│    (ESLint+tsc) │     │(Postgres+Redis)  │     │    (Buildx Cache)│     │(Prisma Migration) │
└─────────────────┘     └──────────────────┘     └──────────────────┘     └───────────────────┘
```

1. **Lint & TypeCheck**: Runs `tsc --noEmit` and `npm run lint` for code quality gates.
2. **Automated Test Suites**: Spins up live PostgreSQL 16 & Redis 7 service containers in the GitHub runner, synchronizes the test database schema, and executes the complete 17 unit tests and 6 Supertest E2E integration tests.
3. **Multi-Stage Docker Packaging**: Validates container buildability using Docker Buildx and GitHub Actions cache.
4. **Zero-Downtime Cloud Deployment**: Safely executes Prisma migrations (`npx prisma db push --skip-generate`) against the production database and triggers a rolling update deployment without exposing secrets.

---

## ☁️ Zero-Downtime Cloud Deployment Guide

This application is designed for instant deployment on cloud platforms (**Render, Railway, AWS EC2 / ECS, or Fly.io**) paired with managed cloud databases (**Neon / Supabase PostgreSQL + Upstash Redis**).

### 1. Cloud Infrastructure Setup (e.g. Neon + Upstash + Render)
1. **PostgreSQL**: Create a serverless PostgreSQL database on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com) and copy the connection string:
   ```env
   DATABASE_URL="postgresql://user:password@ep-xyz.neon.tech/ecommerce_prod?sslmode=require"
   ```
2. **Redis**: Create a serverless Redis instance on [Upstash](https://upstash.com) and obtain the host and port:
   ```env
   REDIS_HOST="us1-fluent-salmon-12345.upstash.io"
   REDIS_PORT=6379
   ```
3. **Web Service**: Create a new Web Service on [Render](https://render.com) or [Railway](https://railway.app) connected to your GitHub repository and set Docker as the runtime environment.

### 2. GitHub Actions Secrets Configuration
To enable the automated CD pipeline, add the following repository secrets in **GitHub ➔ Settings ➔ Secrets and variables ➔ Actions**:

| Secret Name | Description | Example / Source |
|---|---|---|
| `PROD_DATABASE_URL` | Cloud PostgreSQL connection string | `postgresql://user:pass@neon.tech/ecommerce_prod` |
| `RENDER_DEPLOY_HOOK_URL` | Cloud provider deployment webhook | `https://api.render.com/deploy/srv-xyz?key=abc` |
| `JWT_SECRET` | Production JWT secret key | Generated secure 64-char string |

### 3. Secret Isolation & Zero-Downtime Guarantees
- **No `.env` in Git**: Sensitive credentials are never committed (`.gitignore`).
- **Atomic Pre-Deploy Migrations**: Database schema migrations execute *before* new container instances receive traffic, preventing runtime schema mismatches.
- **Health-Checked Rolling Updates**: The cloud provider routes traffic to new container instances only after their `/api/v1/health` probe returns `200 OK`, guaranteeing **zero downtime**.

---

## 🛡️ Distributed Redis Rate Limiting Architecture

Unlike basic in-memory rate limiters that reset when an application scales horizontally, this system uses a custom **`ThrottlerStorageRedisService`**:
- All rate-limit counters (`throttle:<name>:<ip>`) and blocking durations (`throttle:blocked:<name>:<ip>`) are stored natively in **Redis**.
- When the API scales to multiple container instances behind a load balancer, client rate limits (e.g. 100 requests/minute) remain **strictly distributed and synchronized across all nodes**.


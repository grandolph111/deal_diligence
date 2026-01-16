# Database Quickstart Guide

## Prerequisites

- Docker installed and running
- Node.js and npm installed

## Quick Setup

```bash
cd backend

# 1. Start PostgreSQL container (port 5433)
npm run db:local:start

# 2. Generate Prisma Client
npm run db:generate

# 3. Apply migrations to create tables
npm run db:migrate

# 4. (Optional) View database in browser GUI
npm run db:studio
```

## Commands Reference

### Local Development Database

| Command | Description |
|---------|-------------|
| `npm run db:local:start` | Start PostgreSQL Docker container |
| `npm run db:local:stop` | Stop the container |
| `npm run db:local:remove` | Remove container and all data |

### Prisma Commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma Client from schema |
| `npm run db:migrate` | Create and apply migrations |
| `npm run db:push` | Push schema directly (no migration files) |
| `npm run db:studio` | Open database GUI at http://localhost:5555 |

### Test Database

| Command | Description |
|---------|-------------|
| `npm run db:test:setup` | Push schema to test database |
| `npm run db:test:reset` | Reset test database completely |

## Creating Migrations

When you modify `prisma/schema.prisma`:

```bash
# Create and apply migration with a descriptive name
npx prisma migrate dev --name add_user_preferences
```

This will:
1. Generate a new migration file in `prisma/migrations/`
2. Apply the migration to your database
3. Regenerate Prisma Client

## Common Workflows

### Starting Fresh

```bash
npm run db:local:remove    # Delete everything
npm run db:local:start     # Fresh container
npm run db:migrate         # Apply all migrations
```

### Reset Database (Keep Container)

```bash
npx prisma migrate reset   # Drops all tables, re-applies migrations
```

### View Current Database State

```bash
npm run db:studio          # Opens browser GUI
# OR
npx prisma db pull         # Introspect DB and update schema
```

## Troubleshooting

### "Can't reach database server"

1. Check if Docker container is running:
   ```bash
   docker ps
   ```
2. Start it if needed:
   ```bash
   npm run db:local:start
   ```

### Port Already in Use

If port 5433 is taken, either:
- Stop the conflicting service
- Change the port in `package.json` (`db:local:start`) and `.env` (`DATABASE_URL`)

### Migration Conflicts

If migrations are out of sync:
```bash
npx prisma migrate reset   # Warning: deletes all data
```

## Environment Files

| File | Database | Purpose |
|------|----------|---------|
| `.env` | `dealdiligence` | Local development |
| `.env.test` | `dealdiligence_test` | Automated tests |

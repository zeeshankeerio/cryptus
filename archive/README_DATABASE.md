# Database Management Guide

## Quick Start

### After Pulling Schema Changes
```bash
npm run db:sync
npm run dev
```

### After Modifying Schema
```bash
# 1. Edit prisma/schema.prisma
# 2. Sync to database
npm run db:sync
# 3. Restart dev server
npm run dev
```

---

## Available Commands

### Database Sync
```bash
npm run db:sync          # Sync schema to database + regenerate client
npm run db:sync:force    # Force sync (accepts data loss)
npm run db:push          # Push schema to database only
npm run db:generate      # Regenerate Prisma Client only
npm run db:status        # Check migration status
```

### Common Tasks

**Check if database is in sync**:
```bash
npm run db:status
```

**Fix "column does not exist" errors**:
```bash
npm run db:sync
```

**After schema changes**:
```bash
npm run db:sync
```

**Regenerate types only**:
```bash
npm run db:generate
```

---

## Current Setup

This project uses **Prisma db push** workflow (not migrations).

### Pros
- ✅ Fast iteration during development
- ✅ No migration files to manage
- ✅ Simple workflow

### Cons
- ⚠️ No migration history
- ⚠️ Can't rollback changes
- ⚠️ Not ideal for production

---

## Schema Structure

### Models

1. **User** - User accounts
2. **Session** - Authentication sessions
3. **Account** - OAuth accounts
4. **CoinConfig** - Per-user symbol configurations
   - RSI periods (1m, 5m, 15m, 1h)
   - Thresholds (overbought, oversold)
   - Alert toggles
   - Priority, sound, quiet hours
5. **AlertLog** - Alert history
6. **AlertTemplate** - Reusable configurations
7. **PushSubscription** - Web push subscriptions

### Key Fields Added (RSI Screener Improvements)

**CoinConfig**:
- `priority` - Alert priority (low, medium, high, critical)
- `sound` - Alert sound (default, soft, urgent, bell, ping)
- `quietHoursEnabled` - Enable quiet hours
- `quietHoursStart` - Quiet hours start time (0-23)
- `quietHoursEnd` - Quiet hours end time (0-23)
- `alertOnLongCandle` - Enable long candle alerts
- `alertOnVolumeSpike` - Enable volume spike alerts
- `longCandleThreshold` - Long candle multiplier
- `volumeSpikeThreshold` - Volume spike multiplier

**AlertLog**:
- `priority` - Alert priority level

**AlertTemplate** (new table):
- Complete template system for reusable configurations

---

## Troubleshooting

### Error: "column does not exist"

**Solution**:
```bash
npm run db:sync
```

This syncs your Prisma schema to the database.

### Error: "table does not exist"

**Solution**:
```bash
npm run db:sync
```

### Error: "Prisma Client out of sync"

**Solution**:
```bash
npm run db:generate
```

### Database is corrupted

**Solution** (⚠️ DELETES ALL DATA):
```bash
npx prisma migrate reset
npm run db:sync
```

---

## Production Deployment

### Option 1: Using db push (Current)

```bash
# In production environment
npm run db:sync
npm run build
npm start
```

### Option 2: Migrate to Prisma Migrations (Recommended)

```bash
# 1. Baseline existing database
npx prisma migrate dev --name init --create-only
npx prisma migrate resolve --applied init

# 2. Future changes use migrations
npx prisma migrate dev --name add_feature

# 3. Deploy to production
npx prisma migrate deploy
```

---

## Best Practices

### Development
1. Always run `npm run db:sync` after pulling schema changes
2. Test schema changes locally before committing
3. Use `db:sync` for rapid prototyping

### Production
1. Consider migrating to Prisma Migrations for version control
2. Always backup database before schema changes
3. Test migrations in staging first
4. Use `prisma migrate deploy` in CI/CD

### Team Collaboration
1. Commit `prisma/schema.prisma` changes
2. Document schema changes in PR descriptions
3. Run `npm run db:sync` after pulling
4. Communicate breaking changes to team

---

## Migration to Prisma Migrations (Optional)

If you want to switch to proper migrations:

### Step 1: Baseline
```bash
npx prisma migrate dev --name init --create-only
npx prisma migrate resolve --applied init
```

### Step 2: Future Changes
```bash
# Edit schema
vim prisma/schema.prisma

# Create migration
npx prisma migrate dev --name descriptive_name

# Review generated SQL
cat prisma/migrations/*/migration.sql

# Commit
git add prisma/
git commit -m "feat: add new schema fields"
```

### Step 3: Production
```bash
npx prisma migrate deploy
```

---

## Environment Variables

Required for database connection:

```env
DATABASE_URL="postgresql://user:password@host:5432/database"
```

Optional:
```env
DIRECT_URL="postgresql://user:password@host:5432/database"  # For migrations
```

---

## Useful Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma db push](https://www.prisma.io/docs/concepts/components/prisma-migrate/db-push)
- [Prisma Migrate](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Baseline Existing Database](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining)

---

## Support

If you encounter database issues:

1. Check this guide first
2. Run `npm run db:status` to diagnose
3. Try `npm run db:sync` to fix
4. Check `.kiro/specs/rsi-screener-improvements/DATABASE_SYNC_FIX.md` for detailed troubleshooting

---

**Last Updated**: 2024-03-30  
**Status**: ✅ Database schema in sync

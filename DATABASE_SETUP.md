# AudienceW database setup

The app can run with SQLite locally and PostgreSQL online.

## Local development

Keep `.env` like this:

```env
DATABASE_URL="file:../data/audiencew.sqlite"
```

## Online production

Create a PostgreSQL database in Vercel, Neon, or Supabase, then set this environment variable in Vercel:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

After setting `DATABASE_URL`, run the database push once:

```bash
npm run db:push
```

Then redeploy the app.

The build script automatically detects the database URL. If it starts with `postgresql://` or `postgres://`, Prisma generates a PostgreSQL client. Otherwise, it keeps SQLite for local work.

# Temporary Transfer

A small, no-account file and text transfer utility. Files are stored unchanged in a private Supabase Storage bucket; file metadata and text snippets are stored in Supabase tables.

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/migrations/20261003000000_temporary_transfer.sql`](supabase/migrations/20261003000000_temporary_transfer.sql).
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the project API settings. The anon/publishable key is intended for client use; never put a service-role key in this app.
4. Run `npm install`, then `npm run dev`.

The same migration can be applied with the Supabase CLI after linking this project, using `supabase db push`.

## Access model

There is no login by design. The migration grants the `anon` role read, insert, and delete access to transfer records and objects in this bucket. The bucket is private, so files are fetched through the Supabase client rather than public URLs, but the open policies mean anyone who can reach the app can read or delete its items. Do not use this for sensitive content or publish it as a private storage service. The anon key is not a secret; the service-role key must never be exposed.

The app accepts normal file types and does not impose an additional client-side size cap. Supabase project-level Storage limits still apply. Downloads are the original uploaded bytes and filename.
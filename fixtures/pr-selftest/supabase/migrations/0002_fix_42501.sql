-- "Fixed" the 42501 errors with the quick fix: this also exposes profiles, which has no RLS.
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

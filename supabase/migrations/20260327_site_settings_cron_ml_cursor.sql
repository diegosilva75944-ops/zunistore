-- Cursor do cron: próximo produto ML na ordem decrescente de code6 (reimportação completa).
alter table public.site_settings
  add column if not exists cron_ml_reimport_cursor_code6 text null;

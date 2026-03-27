-- O cursor do cron ML passou a ficar em `site_settings.colors` (chave __cron_*).
-- Remove coluna opcional antiga se a migração 20260327 tiver sido aplicada.
alter table public.site_settings drop column if exists cron_ml_reimport_cursor_code6;

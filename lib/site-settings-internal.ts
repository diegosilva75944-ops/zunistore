/**
 * Chave dentro de `site_settings.colors` (jsonb) para estado interno do cron ML.
 * Não usar coluna dedicada: ambientes sem migração continuam funcionando.
 */
export const CRON_ML_REIMPORT_CURSOR_COLORS_KEY = "__cron_ml_reimport_cursor_code6";

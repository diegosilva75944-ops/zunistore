import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { BrowserContext, Page } from "playwright";
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { hasMlProductPageSignals, isMlBlockedOrLoginHtml, ML_FETCH_HEADERS } from "./fetchHtml";

export type PlaywrightFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string };

const PLAYWRIGHT_TIMEOUT_MS = 75_000;
const DEFAULT_STORAGE_STATE_PATH = ".playwright/ml-storage-state.json";
const DEFAULT_USER_DATA_DIR = ".playwright/ml-user-data";

/** Chromium impede dois processos no mesmo perfil; stale/crash deixa locks e `Permission denied` se o UID mudou. */
const CHROMIUM_SINGLETON_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"] as const;

function tryRemoveChromiumSingletonFiles(userDataDirAbs: string): void {
  if (String(process.env.ML_PLAYWRIGHT_SKIP_SINGLETON_CLEANUP ?? "").trim() === "1") {
    return;
  }
  for (const name of CHROMIUM_SINGLETON_FILES) {
    const p = path.join(userDataDirAbs, name);
    try {
      if (existsSync(p)) {
        unlinkSync(p);
        console.info(`[ml-playwright] removido artefato singleton: ${p}`);
      }
    } catch (e) {
      console.warn(
        `[ml-playwright] não foi possível remover ${p} (outro Chromium a usar o perfil ou permissões — chown do .playwright/ml-user-data):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

/** Evita dois `launchPersistentContext` no mesmo `userDataDir` (ProcessSingleton / abort). */
const persistentProfileLaunchChain = new Map<string, Promise<unknown>>();

function enqueuePersistentProfileLaunch<T>(absDir: string, fn: () => Promise<T>): Promise<T> {
  const prev = persistentProfileLaunchChain.get(absDir) ?? Promise.resolve();
  const next = prev.then(async () => {
    tryRemoveChromiumSingletonFiles(absDir);
    return await fn();
  });
  persistentProfileLaunchChain.set(absDir, next.then(() => {}, () => {}));
  return next;
}

/** Base: root e utilizador normal (Ubuntu/GDM); Snap costuma exigir no-sandbox em serviços. */
const CHROMIUM_SERVER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  /** Reduz fingerprint de automação (Chromium / Playwright). */
  "--disable-blink-features=AutomationControlled",
] as const;

const PLAYWRIGHT_IGNORE_DEFAULT_ARGS = ["--enable-automation"] as const;

function isRootProcess(): boolean {
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const euid = typeof process.geteuid === "function" ? process.geteuid() : -1;
  return uid === 0 || euid === 0;
}

function dedupeChromiumArgs(args: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of args) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function parseExtraChromiumArgsFromEnv(): string[] {
  const raw = String(process.env.ML_PLAYWRIGHT_EXTRA_CHROMIUM_ARGS ?? "").trim();
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

/**
 * Args finais do Chromium: no-sandbox (reforço como root), flags Snap/GTK (libproxy), extras do .env.
 */
function buildChromiumLaunchArgs(headless: boolean): string[] {
  const parts: string[] = [];
  if (isRootProcess()) {
    parts.push("--no-sandbox", "--disable-setuid-sandbox");
  }
  parts.push(...CHROMIUM_SERVER_ARGS);
  if (process.platform === "linux") {
    parts.push("--disable-background-networking");
  }
  parts.push(...parseExtraChromiumArgsFromEnv());
  if (!headless) {
    parts.push("--window-size=1365,900");
  }
  return dedupeChromiumArgs(parts);
}

function logChromiumLaunch(
  headless: boolean,
  launchExtra: { executablePath?: string; channel?: "chrome" | "chromium" | "msedge" },
  args: string[],
): void {
  const exe = launchExtra.executablePath ?? launchExtra.channel ?? "playwright-bundled";
  console.info(
    `[ml-playwright] chromium headless=${headless} root=${isRootProcess()} chromiumSandbox=false executable=${exe} args=${JSON.stringify(args)}`,
  );
}

/** Normaliza valor vindo do .env (ex. `0` ou `:0`) para um DISPLAY X11 válido. */
function normalizeX11DisplayValue(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^:\d+(\.\d+)?$/.test(s)) return s;
  if (/^\d+$/.test(s)) return `:${s}`;
  if (/^[\w.-]+:\d+(\.\d+)?$/.test(s)) return s;
  if (s.startsWith(":")) return s;
  return s;
}

/** Defeito GDM + Xorg ecrã local (root/PM2 sem herança do login gráfico). */
const LINUX_DEFAULT_DISPLAY = ":1";
const LINUX_DEFAULT_GDM_XAUTHORITY = "/run/user/1000/gdm/Xauthority";

function linuxAutoX11DefaultsEnabled(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_AUTO_X11 ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function gdmXauthorityCandidates(): string[] {
  const uid = String(process.env.ML_PLAYWRIGHT_GRAPHICAL_UID ?? "1000").trim();
  const custom = String(process.env.ML_PLAYWRIGHT_X11_GDM_XAUTHORITY ?? "").trim();
  const out: string[] = [];
  if (custom) out.push(custom);
  out.push(`/run/user/${uid}/gdm/Xauthority`);
  out.push(LINUX_DEFAULT_GDM_XAUTHORITY);
  return out;
}

/** Sockets em /tmp/.X11-unix → `:0`, `:1`, … (prefere :1 depois :0). */
function inferDisplayFromX11UnixSocket(): string | undefined {
  try {
    const unixDir = "/tmp/.X11-unix";
    if (!existsSync(unixDir)) return undefined;
    const names = readdirSync(unixDir).filter((n) => /^X\d+$/.test(n));
    if (names.length === 0) return undefined;
    const prefer = (["X1", "X0"] as const).find((n) => names.includes(n));
    const pick =
      prefer ??
      [...names].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[names.length - 1];
    return `:${Number(pick.slice(1))}`;
  } catch {
    return undefined;
  }
}

/** `/run/user/<uid>/gdm/Xauthority` existentes (UID maior primeiro — sessão recente). */
function scanGdmXauthorityPathsFromDisk(): string[] {
  const out: string[] = [];
  try {
    const base = "/run/user";
    if (!existsSync(base)) return out;
    for (const ent of readdirSync(base, { withFileTypes: true })) {
      if (!ent.isDirectory() || !/^\d+$/.test(ent.name)) continue;
      const p = path.join(base, ent.name, "gdm", "Xauthority");
      if (existsSync(p)) out.push(p);
    }
  } catch {
    /* */
  }
  return out.sort((a, b) => {
    const ua = Number((a.match(/\/run\/user\/(\d+)\//) ?? [])[1] ?? 0);
    const ub = Number((b.match(/\/run\/user\/(\d+)\//) ?? [])[1] ?? 0);
    return ub - ua;
  });
}

/** Home em `/etc/passwd` para um UID (Linux; falha silenciosa). */
function passwdHomeDirForUid(uidStr: string): string | null {
  const uid = uidStr.trim();
  if (!/^\d+$/.test(uid)) return null;
  try {
    const raw = readFileSync("/etc/passwd", "utf8");
    for (const line of raw.split("\n")) {
      const parts = line.split(":");
      if (parts.length < 7 || parts[2] !== uid) continue;
      const home = parts[5]?.trim();
      return home || null;
    }
  } catch {
    /* */
  }
  return null;
}

/**
 * `~/.Xauthority` do utilizador gráfico (ex. UID 1000), não só do utilizador do processo Node.
 * Com Next/PM2 como root, `os.homedir()` é /root — sem isto nunca se encontra o cookie da sessão GDM.
 */
function graphicalUserHomeXauthorityCandidates(): string[] {
  const out: string[] = [];
  const customHome = String(process.env.ML_PLAYWRIGHT_GRAPHICAL_HOME ?? "").trim();
  if (customHome) out.push(path.join(customHome, ".Xauthority"));
  const uid = String(process.env.ML_PLAYWRIGHT_GRAPHICAL_UID ?? "1000").trim();
  const ph = passwdHomeDirForUid(uid);
  if (ph) out.push(path.join(ph, ".Xauthority"));
  return out;
}

/** Ficheiros tipo xauth sob /run/user/<uid>/ (alguns setups não usam subpasta gdm/). */
function scanRunUserXauthLooseFiles(): string[] {
  const out: string[] = [];
  try {
    const base = "/run/user";
    if (!existsSync(base)) return out;
    for (const ent of readdirSync(base, { withFileTypes: true })) {
      if (!ent.isDirectory() || !/^\d+$/.test(ent.name)) continue;
      const ud = path.join(base, ent.name);
      try {
        for (const f of readdirSync(ud, { withFileTypes: true })) {
          if (!f.isFile()) continue;
          const n = f.name.toLowerCase();
          if (n !== "xauthority" && !n.startsWith("xauth-") && !n.startsWith("xauth_")) continue;
          out.push(path.join(ud, f.name));
        }
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  }
  return out.sort((a, b) => {
    const ua = Number((a.match(/\/run\/user\/(\d+)\//) ?? [])[1] ?? 0);
    const ub = Number((b.match(/\/run\/user\/(\d+)\//) ?? [])[1] ?? 0);
    return ub - ua;
  });
}

/** `/run/user/<uid>/.Xauthority` (algumas sessões X11). */
function runUserDotXauthorityCandidates(): string[] {
  const out: string[] = [];
  try {
    const base = "/run/user";
    if (!existsSync(base)) return out;
    for (const ent of readdirSync(base, { withFileTypes: true })) {
      if (!ent.isDirectory() || !/^\d+$/.test(ent.name)) continue;
      out.push(path.join(base, ent.name, ".Xauthority"));
    }
  } catch {
    /* */
  }
  return out.sort((a, b) => {
    const ua = Number((a.match(/\/run\/user\/(\d+)\//) ?? [])[1] ?? 0);
    const ub = Number((b.match(/\/run\/user\/(\d+)\//) ?? [])[1] ?? 0);
    return ub - ua;
  });
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Ordem de tentativa de cookies X11 (diagnóstico + `pickReadableXauthorityPath`).
 * `ML_PLAYWRIGHT_XAUTHORITY_FILE` = cookie copiado para um path legível pelo processo Node (ex. root).
 */
function buildXauthorityCandidatesOrdered(): string[] {
  const explicit = String(process.env.ML_PLAYWRIGHT_X11_XAUTHORITY ?? "").trim();
  const copiedFile = String(process.env.ML_PLAYWRIGHT_XAUTHORITY_FILE ?? "").trim();
  const def = String(process.env.ML_PLAYWRIGHT_X11_AUTHORITY_DEFAULT ?? LINUX_DEFAULT_GDM_XAUTHORITY).trim();
  return dedupePaths([
    ...(explicit ? [explicit] : []),
    ...(copiedFile ? [copiedFile] : []),
    ...scanGdmXauthorityPathsFromDisk(),
    ...scanRunUserXauthLooseFiles(),
    ...runUserDotXauthorityCandidates(),
    ...gdmXauthorityCandidates(),
    def,
    ...graphicalUserHomeXauthorityCandidates(),
    path.join(os.homedir(), ".Xauthority"),
    ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["/root/.Xauthority"] : []),
  ]);
}

/** Primeiro ficheiro de cookie X11 legível. `ML_PLAYWRIGHT_X11_XAUTHORITY` só conta se existir e for legível (evita .env com path GDM errado). */
function pickReadableXauthorityPath(): string {
  for (const p of buildXauthorityCandidatesOrdered()) {
    if (!existsSync(p)) continue;
    try {
      accessSync(p, fsConstants.R_OK);
      return p;
    } catch {
      /* */
    }
  }
  return "";
}

function detectLinuxContainerKind(): "docker" | "podman" | null {
  if (process.platform !== "linux") return null;
  try {
    if (existsSync("/.dockerenv")) return "docker";
  } catch {
    /* */
  }
  try {
    const cg = readFileSync("/proc/self/cgroup", "utf8");
    if (/docker|containerd|kubepods/i.test(cg)) return "docker";
    if (/podman/i.test(cg)) return "podman";
  } catch {
    /* */
  }
  return null;
}

/** Sockets X11 visíveis neste processo (útil: existir socket sem cookie ⇒ típico Docker / FS errado). */
function x11UnixSocketsDebug(): string {
  try {
    const dir = "/tmp/.X11-unix";
    if (!existsSync(dir)) return "x11_unix=absent";
    const names = readdirSync(dir).filter((n) => /^X\d+$/.test(n));
    return names.length ? `x11_unix=${names.join(",")}` : "x11_unix=empty_dir";
  } catch {
    return "x11_unix=error";
  }
}

/** No Docker, paths como `/run/user/1000/gdm/Xauthority` são do host — não existem no FS do contentor até copiar para um volume. */
function xauthorityFileDockerHostPathHint(): string {
  const p = String(process.env.ML_PLAYWRIGHT_XAUTHORITY_FILE ?? "").trim();
  if (!p || existsSync(p)) return "";
  const ctr = detectLinuxContainerKind();
  if (!ctr) return "";
  if (/\/run\/user\/\d+\//.test(p) || /^\/home\/[^/]+\//.test(p)) {
    return (
      " NOTA_ML_PLAYWRIGHT_XAUTHORITY_FILE: este caminho é típico do host; no contentor copie o ficheiro binário para um volume " +
      "(ex. /data/ml-xauth) e defina ML_PLAYWRIGHT_XAUTHORITY_FILE=/data/ml-xauth — não reutilize o path do host."
    );
  }
  return "";
}

function x11DockerMissingSocketHint(): string {
  const ctr = detectLinuxContainerKind();
  if (!ctr) return "";
  if (x11UnixSocketsDebug() !== "x11_unix=absent") return "";
  return " NOTA_X11: /tmp/.X11-unix ausente no contentor — modo gráfico exige montar o socket do host (ex.: -v /tmp/.X11-unix:/tmp/.X11-unix) e DISPLAY igual ao do host.";
}

/** Resumo para o debug do import: primeiros candidatos e se existem / são legíveis pelo processo atual. */
export function getXauthorityDiscoveryDebug(): string {
  applyPlaywrightLinuxDisplayEnv();
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const ctr = detectLinuxContainerKind();
  const parts = buildXauthorityCandidatesOrdered()
    .slice(0, 14)
    .map((p) => {
      if (!existsSync(p)) return `${p}=missing`;
      try {
        accessSync(p, fsConstants.R_OK);
        return `${p}=ok`;
      } catch {
        return `${p}=unreadable`;
      }
    });
  const fileEnv = String(process.env.ML_PLAYWRIGHT_XAUTHORITY_FILE ?? "").trim();
  const fileHint = fileEnv ? ` ML_PLAYWRIGHT_XAUTHORITY_FILE=${fileEnv}(${existsSync(fileEnv) ? "exists" : "missing"})` : "";
  return `uid=${uid}; container=${ctr ?? "no"}; ${x11UnixSocketsDebug()};${fileHint} ${parts.join("; ")}${xauthorityFileDockerHostPathHint()}${x11DockerMissingSocketHint()}`;
}

function linuxX11SessionAccessible(): boolean {
  const xa = String(process.env.XAUTHORITY ?? "").trim();
  if (!xa) return false;
  if (!existsSync(xa)) return false;
  try {
    accessSync(xa, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function logPlaywrightX11Env(label: string): void {
  if (process.platform !== "linux") return;
  syncX11DisplayFromEnv();
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const euid = typeof process.geteuid === "function" ? process.geteuid() : -1;
  const ok = linuxX11SessionAccessible();
  const w = String(process.env.WAYLAND_DISPLAY ?? "").trim();
  const sockHint = inferDisplayFromX11UnixSocket() ?? "—";
  console.info(
    `[ml-playwright] ${label} DISPLAY=${process.env.DISPLAY ?? ""} XAUTHORITY=${process.env.XAUTHORITY ?? ""} WAYLAND_DISPLAY=${w || "—"} uid=${uid} euid=${euid} xAccessible=${ok} socketInferDisplay=${sockHint}`,
  );
}

/**
 * Sincroniza DISPLAY / XAUTHORITY (GDM, root, PM2). Não sobrescreve DISPLAY já definido (ex.: SSH).
 */
function syncX11DisplayFromEnv(): void {
  if (process.platform !== "linux") return;
  if (linuxAutoX11DefaultsEnabled() && !String(process.env.DISPLAY ?? "").trim()) {
    const inferred = inferDisplayFromX11UnixSocket();
    if (inferred) process.env.DISPLAY = inferred;
  }
  let d = String(process.env.DISPLAY ?? "").trim();
  if (!d) {
    const fromEnv = String(
      process.env.ML_PLAYWRIGHT_X11_DISPLAY ?? process.env.ML_PLAYWRIGHT_DISPLAY ?? "",
    ).trim();
    if (fromEnv) {
      const resolved = normalizeX11DisplayValue(fromEnv);
      if (resolved) process.env.DISPLAY = resolved;
    }
  }
  d = String(process.env.DISPLAY ?? "").trim();
  if (!d && linuxAutoX11DefaultsEnabled()) {
    const raw = String(process.env.ML_PLAYWRIGHT_X11_DISPLAY_DEFAULT ?? LINUX_DEFAULT_DISPLAY).trim();
    const resolved = normalizeX11DisplayValue(raw || LINUX_DEFAULT_DISPLAY);
    if (resolved) process.env.DISPLAY = resolved;
  }
  let xa = String(process.env.XAUTHORITY ?? "").trim();
  if (!xa) {
    if (linuxAutoX11DefaultsEnabled()) {
      process.env.XAUTHORITY = pickReadableXauthorityPath();
    } else {
      const fb = String(process.env.ML_PLAYWRIGHT_X11_XAUTHORITY ?? "").trim();
      process.env.XAUTHORITY = fb || path.join(os.homedir(), ".Xauthority");
    }
  }
  const pin = String(process.env.ML_PLAYWRIGHT_X11_PIN_DEFAULTS ?? "").trim().toLowerCase();
  if (process.platform === "linux" && (pin === "1" || pin === "true" || pin === "yes")) {
    process.env.DISPLAY = LINUX_DEFAULT_DISPLAY;
    process.env.XAUTHORITY = LINUX_DEFAULT_GDM_XAUTHORITY;
    if (!existsSync(LINUX_DEFAULT_GDM_XAUTHORITY)) {
      const picked = pickReadableXauthorityPath();
      if (picked) process.env.XAUTHORITY = picked;
    }
  }
  if (linuxAutoX11DefaultsEnabled()) {
    const xaBad = String(process.env.XAUTHORITY ?? "").trim();
    if (xaBad && !linuxX11SessionAccessible()) {
      const picked = pickReadableXauthorityPath();
      if (picked) process.env.XAUTHORITY = picked;
    }
  }
  if (process.platform === "linux") {
    const d2 = String(process.env.DISPLAY ?? "").trim();
    const xa2 = String(process.env.XAUTHORITY ?? "").trim();
    if (d2 && xa2 && !linuxX11SessionAccessible()) {
      console.warn(
        `[ml-playwright] X11: cookie ilegível para este processo (uid=${typeof process.getuid === "function" ? String(process.getuid()) : "?"}). Modo gráfico falhará até ${xa2} ser legível ou o serviço correr como o utilizador da sessão GDM.`,
      );
    }
  }
}

/** `env` explícito para o processo do Chromium (SSH/root/Snap); GIO/GTK reduzem erros libproxy em Ubuntu Snap. */
function playwrightBrowserEnv(): Record<string, string> {
  syncX11DisplayFromEnv();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) out[k] = v;
  }
  if (process.platform === "linux") {
    if (out.GIO_USE_PROXY === undefined) out.GIO_USE_PROXY = "0";
    if (out.GTK_USE_PORTAL === undefined) out.GTK_USE_PORTAL = "0";
  }
  return out;
}

function looksLikeX11OrDisplayError(msg: string): boolean {
  return /Missing X server|missing x server|\$DISPLAY|cannot open display|X11|BadValue|Authorization|Xauthority|Xvfb|Gtk-WARNING.*cannot open display|No protocol specified|libpxbackend|libgiolibproxy|libproxy|snap|error while loading shared libraries|cannot load shared object/i.test(
    msg,
  );
}

/**
 * Aplica variáveis X11 do .env antes de logar `DISPLAY` ou abrir o Chromium (idempotente).
 */
export function applyPlaywrightLinuxDisplayEnv(): void {
  syncX11DisplayFromEnv();
}

/**
 * Chromium com janela (headed): Wayland, ou X11 com DISPLAY + cookie legível (root precisa de XAUTHORITY GDM).
 */
export function hasDisplayForHeadedChromium(): boolean {
  syncX11DisplayFromEnv();
  const p = process.platform;
  if (p === "darwin" || p === "win32") return true;
  const w = String(process.env.WAYLAND_DISPLAY ?? "").trim();
  if (w) return true;
  if (p !== "linux") {
    const d = String(process.env.DISPLAY ?? "").trim();
    return Boolean(d);
  }
  const d = String(process.env.DISPLAY ?? "").trim();
  if (!d) return false;
  return linuxX11SessionAccessible();
}

/** Mensagem para debug quando DISPLAY parece ok mas headed falha (ex.: root sem leitura do cookie GDM). */
export function getLinuxHeadedChromiumUnavailableReason(): string | null {
  applyPlaywrightLinuxDisplayEnv();
  const p = process.platform;
  if (p === "darwin" || p === "win32") return null;
  if (hasDisplayForHeadedChromium()) return null;
  const w = String(process.env.WAYLAND_DISPLAY ?? "").trim();
  if (w) return null;
  const d = String(process.env.DISPLAY ?? "").trim();
  const xa = String(process.env.XAUTHORITY ?? "").trim();
  if (!d) {
    return "DISPLAY não está definido no processo Node — defina ML_PLAYWRIGHT_X11_DISPLAY=:1 ou arranque com scripts/run.sh / systemd.";
  }
  if (!xa) {
    const ctr = detectLinuxContainerKind();
    const sock = x11UnixSocketsDebug();
    const dockerHint =
      ctr === "docker" || ctr === "podman"
        ? " Contentor: copie o cookie do host para um volume (ML_PLAYWRIGHT_XAUTHORITY_FILE) ou monte o home do utilizador gráfico; o contentor não tem ~/.Xauthority por defeito."
        : /x11_unix=X\d+/.test(sock) && !sock.includes("absent")
          ? " Há socket X11 neste FS mas nenhum cookie — confirme que o Next corre no mesmo ambiente que a sessão gráfica (não só DISPLAY=:1 no .env)."
          : "";
    return (
      "nenhum cookie X11 legível (XAUTHORITY vazio). No host com sessão gráfica: `cp ~/.Xauthority /caminho/legível` e `ML_PLAYWRIGHT_XAUTHORITY_FILE=…`; ou `systemd User=` ao utilizador da sessão." +
      dockerHint
    );
  }
  if (!existsSync(xa)) {
    return `XAUTHORITY não existe: ${xa}`;
  }
  try {
    accessSync(xa, fsConstants.R_OK);
  } catch {
    const uid = typeof process.getuid === "function" ? process.getuid() : -1;
    return `sem permissão de leitura em ${xa} (uid do processo=${uid}). Comum com Next.js como root e cookie do utilizador gráfico (UID 1000): execute o serviço como esse utilizador, ou copie/merge o cookie (xauth), ou ajuste ACL — não é falta de DISPLAY (já está ${d}).`;
  }
  return "sessão X11 não utilizável.";
}

function postGotoSettleMs(): number {
  const raw = String(process.env.ML_PLAYWRIGHT_POST_GOTO_MS ?? "").trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, 60_000);
  return 2000;
}

function shouldRunHeadless(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_HEADLESS ?? "").trim().toLowerCase();
  if (!v) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return true;
}

function shouldOpenHeadedOnBlock(): boolean {
  if (!hasDisplayForHeadedChromium()) return false;
  const v = String(process.env.ML_PLAYWRIGHT_HEADED_ON_BLOCK ?? "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return process.env.NODE_ENV === "development";
}

function interactiveTimeoutMs(): number {
  const raw = String(process.env.ML_PLAYWRIGHT_INTERACTIVE_TIMEOUT_MS ?? "").trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 10_000) return Math.min(n, 1_800_000);
  return 600_000;
}

function isBlockedUrl(url: string): boolean {
  return /\/gz\/account-verification\b|captcha/i.test(url);
}

function looksLikePlaywrightBlockError(err: string): boolean {
  return /bloqueado|captcha|account-verification/i.test(err);
}

function isPlaywrightResultUsable(r: PlaywrightFetchResult): boolean {
  if (!r.ok) return false;
  if (isBlockedUrl(r.finalUrl)) return false;
  if (isMlBlockedOrLoginHtml(r.html)) return false;
  return true;
}

/** Deb/apt antes de Snap (evita libpxbackend/libgiolibproxy em muitos servidores). */
const LINUX_CHROMIUM_FALLBACKS = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
] as const;

function chromiumExecutableCandidates(preferred: string): string[] {
  const out: string[] = [];
  const p = preferred.trim();
  if (p) out.push(p);
  if (process.platform === "linux") {
    for (const f of LINUX_CHROMIUM_FALLBACKS) {
      if (!out.includes(f)) out.push(f);
    }
  }
  return out;
}

/**
 * Resolve o binário real; se `ML_PLAYWRIGHT_EXECUTABLE_PATH` apontar para ficheiro inexistente,
 * tenta fallbacks (ex. Ubuntu Snap em `/snap/bin/chromium`).
 */
function resolveSystemChromiumExecutablePath(): string | undefined {
  const preferred = String(
    process.env.ML_PLAYWRIGHT_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      "",
  ).trim();

  for (const candidate of chromiumExecutableCandidates(preferred)) {
    if (!candidate) continue;
    try {
      if (existsSync(candidate)) {
        if (preferred && candidate !== preferred) {
          console.warn(
            `[ml-playwright] Chromium: ${JSON.stringify(preferred)} não existe; a usar ${candidate}. ` +
              `Atualize ML_PLAYWRIGHT_EXECUTABLE_PATH se quiser fixar o caminho.`,
          );
        }
        return candidate;
      }
    } catch {
      /* */
    }
  }

  if (preferred) {
    console.warn(
      `[ml-playwright] Chromium não encontrado em ${JSON.stringify(preferred)} nem nos fallbacks; ` +
        `a usar o Chromium empacotado pelo Playwright (instale snap ou ajuste o caminho).`,
    );
  }
  return undefined;
}

function playwrightExecutableOrChannel(): { executablePath?: string; channel?: "chrome" | "chromium" | "msedge" } {
  const resolved = resolveSystemChromiumExecutablePath();
  if (resolved) return { executablePath: resolved };
  const ch = String(process.env.ML_PLAYWRIGHT_CHANNEL ?? "").trim().toLowerCase();
  if (ch === "chrome" || ch === "chromium" || ch === "msedge") return { channel: ch };
  return {};
}

function mlPlaywrightUserAgentAndPlatform(): { userAgent: string; secChUaPlatform: string } {
  const custom = String(process.env.ML_PLAYWRIGHT_USER_AGENT ?? "").trim();
  if (custom) {
    return {
      userAgent: custom,
      secChUaPlatform: process.platform === "linux" ? '"Linux"' : '"Windows"',
    };
  }
  if (process.platform === "linux") {
    return {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      secChUaPlatform: '"Linux"',
    };
  }
  return {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUaPlatform: '"Windows"',
  };
}

function mlExtraHttpHeaders(): Record<string, string> {
  const { userAgent, secChUaPlatform } = mlPlaywrightUserAgentAndPlatform();
  return {
    ...ML_FETCH_HEADERS,
    "User-Agent": userAgent,
    "sec-ch-ua-platform": secChUaPlatform,
  };
}

function mlViewport() {
  return { width: 1365, height: 900 };
}

function mlSkipWarmup(): boolean {
  return ["1", "true", "yes", "on"].includes(String(process.env.ML_PLAYWRIGHT_SKIP_WARMUP ?? "").trim().toLowerCase());
}

function isMercadoLivreHost(url: string): boolean {
  return /mercadolivre\.com|mercadolibre\.com|meli\.la/i.test(url);
}

/**
 * Mesma sessão: home ML primeiro (cookies/contexto), depois PDP — reduz redirecionamentos para account-verification.
 */
async function warmMercadoLivreHome(page: Page, settleMs: number): Promise<void> {
  try {
    await page.goto("https://www.mercadolivre.com.br/", {
      waitUntil: "domcontentloaded",
      timeout: 35_000,
    });
    const w = Math.min(2500, Math.max(600, settleMs));
    await new Promise((r) => setTimeout(r, w));
  } catch {
    /* continua para a PDP */
  }
}

/** Ordem: URL original → sem query → permalink curto produto.mercadolivre.com.br/MLB-dígitos */
function mlPdpUrlVariants(url: string): string[] {
  const seen = new Set<string>();
  const add = (u: string) => {
    const t = String(u || "").trim();
    if (t) seen.add(t);
  };
  add(url);
  try {
    const u = new URL(url);
    if (!isMercadoLivreHost(u.href)) return [...seen];
    const noQuery = `${u.origin}${u.pathname}`;
    add(noQuery);
    const m = u.pathname.match(/MLB[_-](\d{6,})/i);
    if (m) {
      add(`https://produto.mercadolivre.com.br/MLB-${m[1]}`);
    }
  } catch {
    /* */
  }
  return [...seen];
}

async function attachMlStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
}

async function snapshotAfterGoto(
  page: Page,
  targetUrl: string,
  waitUntil: "domcontentloaded" | "load",
  settleMs: number,
  withWarmup: boolean,
): Promise<PlaywrightFetchResult> {
  if (withWarmup && isMercadoLivreHost(targetUrl) && !mlSkipWarmup()) {
    await warmMercadoLivreHome(page, settleMs);
  }
  await page.goto(targetUrl, {
    waitUntil,
    timeout: PLAYWRIGHT_TIMEOUT_MS,
  });
  await new Promise((r) => setTimeout(r, settleMs));
  const html = await page.content();
  const finalUrl = page.url();
  if (isBlockedUrl(finalUrl)) {
    console.warn(`[ml-playwright] ML bloqueio/captcha (URL): ${finalUrl}`);
    return {
      ok: false,
      error: `Playwright: bloqueado (finalUrl=${finalUrl})`,
    };
  }
  if (isMlBlockedOrLoginHtml(html)) {
    console.warn(`[ml-playwright] ML bloqueio/captcha (HTML login/challenge) finalUrl=${finalUrl}`);
    return {
      ok: false,
      error: `Playwright: bloqueado (HTML login/captcha) finalUrl=${finalUrl}`,
    };
  }
  return { ok: true, html, finalUrl };
}

type PlaywrightFetchOpts = {
  waitUntil?: "domcontentloaded" | "load";
  settleMs?: number;
};

/** Uma janela + várias abas (pool) — empréstimo por fetch; até `poolSize` operações em paralelo. */
type MlPlaywrightSharedSession = {
  context: BrowserContext;
  pool: Page[];
  freeIdx: number[];
  waiters: ((idx: number) => void)[];
};

const mlPlaywrightSharedSessionAls = new AsyncLocalStorage<MlPlaywrightSharedSession>();

async function borrowPipelineSlot(
  s: MlPlaywrightSharedSession,
): Promise<{ page: Page; index: number }> {
  const idx =
    s.freeIdx.length > 0 ?
      s.freeIdx.pop()!
    : await new Promise<number>((resolve) => {
        s.waiters.push(resolve);
      });
  return { page: s.pool[idx], index: idx };
}

function releasePipelineSlot(s: MlPlaywrightSharedSession, index: number) {
  const w = s.waiters.shift();
  if (w) w(index);
  else s.freeIdx.push(index);
}

/**
 * Abre um Chromium persistente e um **pool de abas** (defeito 10; `poolSize: 1` = uma aba).
 * Cada `fetchHtmlWithPlaywright` pede uma aba livre; liberta ao terminar.
 */
export async function runWithMlPlaywrightBrowserSession<T>(
  fn: () => Promise<T>,
  opts?: { poolSize?: number },
): Promise<T> {
  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("sharedSession");
  const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
  const absDir = path.resolve(process.cwd(), userDataDir);
  mkdirSync(absDir, { recursive: true });

  return enqueuePersistentProfileLaunch(absDir, async () => {
    const { chromium } = await import("playwright");
    const headless = !hasDisplayForHeadedChromium();
    const launchExtra = playwrightExecutableOrChannel();
    const chromiumArgs = buildChromiumLaunchArgs(headless);
    logChromiumLaunch(headless, launchExtra, chromiumArgs);
    const browserEnv = playwrightBrowserEnv();
    const contextBase = {
      ...launchExtra,
      headless,
      chromiumSandbox: false,
      env: browserEnv,
      args: chromiumArgs,
      ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
      locale: "pt-BR" as const,
      viewport: mlViewport(),
      userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
      extraHTTPHeaders: mlExtraHttpHeaders(),
      timezoneId: "America/Sao_Paulo",
    };
    const context = await chromium.launchPersistentContext(absDir, contextBase);
    await attachMlStealth(context);
    const poolSize = Math.min(20, Math.max(1, opts?.poolSize ?? 10));
    const pool = await Promise.all(Array.from({ length: poolSize }, () => context.newPage()));
    const session: MlPlaywrightSharedSession = {
      context,
      pool,
      freeIdx: pool.map((_, i) => i),
      waiters: [],
    };
    console.info(
      `[ml-playwright] Sessão única: pool de ${poolSize} aba(s) no mesmo browser até o fim do pipeline.`,
    );
    try {
      return await mlPlaywrightSharedSessionAls.run(session, fn);
    } finally {
      for (const p of session.pool) {
        await p.close().catch(() => {});
      }
      await context.close().catch(() => {});
      console.info("[ml-playwright] Sessão única encerrada.");
    }
  });
}

async function runPlaywrightFetchOnce(
  url: string,
  useHeadless: boolean,
  opts?: PlaywrightFetchOpts,
): Promise<PlaywrightFetchResult> {
  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("launchPersistentContext");
  const headless = !hasDisplayForHeadedChromium() ? true : useHeadless;
  const waitUntil = opts?.waitUntil ?? "domcontentloaded";
  const settleMs = opts?.settleMs ?? postGotoSettleMs();

  const shared = mlPlaywrightSharedSessionAls.getStore();
  if (shared) {
    const slot = await borrowPipelineSlot(shared);
    let page = slot.page;
    try {
      let last: PlaywrightFetchResult = { ok: false, error: "Playwright: sem resultado" };
      for (const tryUrl of mlPdpUrlVariants(url)) {
        try {
          last = await snapshotAfterGoto(page, tryUrl, waitUntil, settleMs, true);
          if (isPlaywrightResultUsable(last)) return last;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          last = { ok: false, error: `Playwright: ${msg}` };
          if (page.isClosed()) {
            const fresh = await shared.context.newPage();
            shared.pool[slot.index] = fresh;
            page = fresh;
          }
        }
      }
      return last;
    } finally {
      releasePipelineSlot(shared, slot.index);
    }
  }

  const { chromium } = await import("playwright");
  const launchExtra = playwrightExecutableOrChannel();
  const browserEnv = playwrightBrowserEnv();
  const chromiumArgs = buildChromiumLaunchArgs(headless);
  logChromiumLaunch(headless, launchExtra, chromiumArgs);

  const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
  const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

  const contextBase = {
    ...launchExtra,
    headless,
    chromiumSandbox: false,
    env: browserEnv,
    args: chromiumArgs,
    ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
    locale: "pt-BR" as const,
    viewport: mlViewport(),
    userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
    extraHTTPHeaders: mlExtraHttpHeaders(),
    timezoneId: "America/Sao_Paulo",
  };

  if (userDataDir) {
    const absDir = path.resolve(process.cwd(), userDataDir);
    mkdirSync(absDir, { recursive: true });
    return enqueuePersistentProfileLaunch(absDir, async () => {
      const context = await chromium.launchPersistentContext(absDir, contextBase);
      try {
        await attachMlStealth(context);
        let last: PlaywrightFetchResult = { ok: false, error: "Playwright: sem resultado" };
        for (const tryUrl of mlPdpUrlVariants(url)) {
          const page = await context.newPage();
          try {
            last = await snapshotAfterGoto(page, tryUrl, waitUntil, settleMs, true);
            if (isPlaywrightResultUsable(last)) return last;
          } finally {
            await page.close().catch(() => {});
          }
        }
        return last;
      } finally {
        const rawClose = String(process.env.ML_PLAYWRIGHT_HEADED_CLOSE_DELAY_MS ?? "").trim();
        const skipClose = ["1", "true", "yes"].includes(
          String(process.env.ML_PLAYWRIGHT_HEADED_SKIP_CLOSE_DELAY ?? "").trim().toLowerCase(),
        );
        if (!headless && !skipClose) {
          if (rawClose === "") {
            await new Promise((r) => setTimeout(r, 250));
          } else {
            const closeMs = Number(rawClose);
            if (Number.isFinite(closeMs) && closeMs > 0) {
              await new Promise((r) => setTimeout(r, Math.min(closeMs, 30_000)));
            }
          }
        }
        await context.close().catch(() => {});
      }
    });
  }

  const browser = await chromium.launch({
    headless,
    chromiumSandbox: false,
    env: browserEnv,
    ...launchExtra,
    args: chromiumArgs,
    ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
  });
  try {
    const context = await browser.newContext({
      userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
      locale: "pt-BR",
      viewport: mlViewport(),
      extraHTTPHeaders: mlExtraHttpHeaders(),
      timezoneId: "America/Sao_Paulo",
      storageState: existsSync(storageStatePath) ? storageStatePath : undefined,
    });
    await attachMlStealth(context);
    let last: PlaywrightFetchResult = { ok: false, error: "Playwright: sem resultado" };
    for (const tryUrl of mlPdpUrlVariants(url)) {
      const page = await context.newPage();
      try {
        last = await snapshotAfterGoto(page, tryUrl, waitUntil, settleMs, true);
        if (isPlaywrightResultUsable(last)) return last;
      } finally {
        await page.close().catch(() => {});
      }
    }
    return last;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runPlaywrightFetch(
  url: string,
  useHeadless: boolean,
  opts?: PlaywrightFetchOpts,
): Promise<PlaywrightFetchResult> {
  try {
    let result = await runPlaywrightFetchOnce(url, useHeadless, opts);
    const errText = result.ok ? "" : result.error;
    if (!result.ok && !useHeadless && looksLikeX11OrDisplayError(errText)) {
      console.warn("[ml-playwright] Falha ao ligar ao servidor X11; a repetir em headless.");
      result = await runPlaywrightFetchOnce(url, true, opts);
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let result: PlaywrightFetchResult = { ok: false, error: `Playwright: ${msg}` };
    if (!useHeadless && looksLikeX11OrDisplayError(msg)) {
      console.warn("[ml-playwright] Exceção X11; a repetir em headless.");
      try {
        result = await runPlaywrightFetchOnce(url, true, opts);
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        result = { ok: false, error: `Playwright: ${m2}` };
      }
    }
    return result;
  }
}

function snapshotLooksLikeProduct(lastUrl: string, lastHtml: string): boolean {
  if (!lastUrl || !lastHtml) return false;
  if (isBlockedUrl(lastUrl)) return false;
  if (isMlBlockedOrLoginHtml(lastHtml)) return false;
  return hasMlProductPageSignals(lastHtml);
}

async function runPlaywrightHeadedInteractive(url: string): Promise<PlaywrightFetchResult> {
  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("interactive");
  if (!hasDisplayForHeadedChromium()) {
    return {
      ok: false,
      error:
        "Playwright (interativo): Linux sem DISPLAY/Wayland ou XAUTHORITY ilegível — não é possível abrir janela. " +
        "Use headless com perfil já logado (ML_PLAYWRIGHT_USER_DATA_DIR ou ML_PLAYWRIGHT_STORAGE_STATE). " +
        "Defina ML_PLAYWRIGHT_EXECUTABLE_PATH para o Chromium do sistema se o bundle Playwright for bloqueado.",
    };
  }

  const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
  const absDir = path.resolve(process.cwd(), userDataDir);
  mkdirSync(absDir, { recursive: true });

  return enqueuePersistentProfileLaunch(absDir, async () => {
    try {
      const { chromium } = await import("playwright");

    const maxWait = interactiveTimeoutMs();
    const deadline = Date.now() + maxWait;
    const launchExtra = playwrightExecutableOrChannel();
    const chromiumArgs = buildChromiumLaunchArgs(false);
    logChromiumLaunch(false, launchExtra, chromiumArgs);

    console.warn(
      `[ml-playwright] Abrindo janela para login/verificação do Mercado Livre. ` +
        `Aguarde o anúncio carregar; pode fechar a janela quando o produto estiver visível (até ${Math.round(maxWait / 1000)}s).`,
    );

    const context = await chromium.launchPersistentContext(absDir, {
      ...launchExtra,
      headless: false,
      chromiumSandbox: false,
      env: playwrightBrowserEnv(),
      args: chromiumArgs,
      ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
      locale: "pt-BR",
      viewport: mlViewport(),
      userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
      extraHTTPHeaders: mlExtraHttpHeaders(),
      timezoneId: "America/Sao_Paulo",
    });
    await attachMlStealth(context);

    let lastHtml = "";
    let lastUrl = "";

    try {
      const page = await context.newPage();

      const capture = async () => {
        try {
          if (page.isClosed()) return;
          lastUrl = page.url();
          lastHtml = await page.content();
        } catch {
          /* navegação em curso */
        }
      };

      page.on("load", () => {
        void capture();
      });
      page.on("framenavigated", () => {
        void capture();
      });

      const tryUrls = mlPdpUrlVariants(url);
      for (const u of tryUrls) {
        const snap = await snapshotAfterGoto(page, u, "domcontentloaded", Math.max(postGotoSettleMs(), 1500), true);
        if (snap.ok && isPlaywrightResultUsable(snap)) {
          return snap;
        }
        await capture();
        if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
          return { ok: true, html: lastHtml, finalUrl: lastUrl };
        }
      }

      while (Date.now() < deadline) {
        try {
          if (page.isClosed()) {
            if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
              return { ok: true, html: lastHtml, finalUrl: lastUrl };
            }
            return {
              ok: false,
              error:
                "Playwright: janela fechada antes de carregar o anúncio. Conclua a verificação na conta, aguarde a página do produto e só então feche a janela.",
            };
          }

          const finalUrl = page.url();
          const html = await page.content();
          lastHtml = html;
          lastUrl = finalUrl;

          if (!isBlockedUrl(finalUrl) && !isMlBlockedOrLoginHtml(html) && hasMlProductPageSignals(html)) {
            await new Promise((r) => setTimeout(r, 1000));
            if (page.isClosed()) {
              if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
                return { ok: true, html: lastHtml, finalUrl: lastUrl };
              }
              break;
            }
            const h2 = await page.content();
            const u2 = page.url();
            if (
              !isBlockedUrl(u2) &&
              !isMlBlockedOrLoginHtml(h2) &&
              hasMlProductPageSignals(h2)
            ) {
              return { ok: true, html: h2, finalUrl: u2 };
            }
          }
        } catch {
          if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
            return { ok: true, html: lastHtml, finalUrl: lastUrl };
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
        return { ok: true, html: lastHtml, finalUrl: lastUrl };
      }

      return {
        ok: false,
        error: `Playwright: tempo esgotado (${Math.round(maxWait / 1000)}s) sem obter a página do produto. Verifique login e tente de novo.`,
      };
    } finally {
      await context.close().catch(() => {});
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      /browserType\.launch|Target page|closed|has been closed/i.test(msg) && !/DISPLAY/i.test(msg) ?
        ""
      : /DISPLAY|Missing X server|gtk/i.test(msg) ?
        " (Linux: DISPLAY=:1 e XAUTHORITY GDM; scripts/run.sh ou xhost +SI:localuser:root)"
      : "";
    return {
      ok: false,
      error: `Playwright (interativo): ${msg}${hint}`,
    };
  }
  });
}

export type FetchHtmlWithPlaywrightOptions = {
  /**
   * `false` = Chromium com janela (import/sync; no Linux costuma ser **X11** com `DISPLAY=:0`).
   * `true` = forçar headless. `undefined` = `ML_PLAYWRIGHT_HEADLESS` / defeito.
   */
  headless?: boolean;
};

function strictHeadedWhenNoDisplay(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_STRICT_HEADED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveFetchHeadless(opts?: FetchHtmlWithPlaywrightOptions): boolean {
  if (opts?.headless === true) return true;
  if (opts?.headless === false) {
    if (!hasDisplayForHeadedChromium()) {
      console.warn(
        "[ml-playwright] Modo gráfico pedido (headless=false) mas sem sessão gráfica no processo Node (X11: DISPLAY; Wayland: WAYLAND_DISPLAY) — a usar headless. " +
          "Servidor X11: defina DISPLAY=:0 no systemd ou ML_PLAYWRIGHT_X11_DISPLAY=:0 no .env; opcional ML_PLAYWRIGHT_X11_XAUTHORITY. " +
          "ML_PLAYWRIGHT_STRICT_HEADED=1 falha em vez de fallback.",
      );
      return true;
    }
    return false;
  }
  return shouldRunHeadless();
}

/** Mesma lógica que `fetchHtmlWithPlaywright` usa para decidir headless (útil para mensagens de debug). */
export function getEffectivePlaywrightHeadless(opts?: FetchHtmlWithPlaywrightOptions): boolean {
  return resolveFetchHeadless(opts);
}

/**
 * Abre o Chromium (headless ou com janela), obtém o HTML e fecha o browser no `finally` de cada contexto.
 * Com `headless: false`, não abre segunda janela interativa no fim — só uma sessão gráfica por chamada.
 */
export async function fetchHtmlWithPlaywright(
  url: string,
  opts?: FetchHtmlWithPlaywrightOptions,
): Promise<PlaywrightFetchResult> {
  if (opts?.headless === false && !hasDisplayForHeadedChromium() && strictHeadedWhenNoDisplay()) {
    return {
      ok: false,
      error:
        "Modo gráfico pedido mas não há sessão gráfica visível no processo Node (X11: DISPLAY; Wayland: WAYLAND_DISPLAY). Servidor X11: DISPLAY=:0 no systemd ou ML_PLAYWRIGHT_X11_DISPLAY=:0 no .env; opcional ML_PLAYWRIGHT_X11_XAUTHORITY. Reinicie o Next.js ou remova ML_PLAYWRIGHT_STRICT_HEADED.",
    };
  }
  const headless = resolveFetchHeadless(opts);
  let last = await runPlaywrightFetch(url, headless, undefined);

  if (isPlaywrightResultUsable(last)) {
    return last;
  }

  const blockedHtml =
    last.ok && (isMlBlockedOrLoginHtml(last.html) || isBlockedUrl(last.finalUrl));
  const blockedErr = !last.ok && looksLikePlaywrightBlockError(last.error);

  if (blockedHtml || blockedErr) {
    const settle = Math.max(postGotoSettleMs(), 4500);
    const second = await runPlaywrightFetch(url, headless, { waitUntil: "load", settleMs: settle });
    if (isPlaywrightResultUsable(second)) {
      return second;
    }
    last = second;
  }

  if (!headless) {
    return last;
  }

  if (!shouldOpenHeadedOnBlock()) {
    return last;
  }

  const needsRetry =
    (last.ok && (isMlBlockedOrLoginHtml(last.html) || isBlockedUrl(last.finalUrl))) ||
    (!last.ok && looksLikePlaywrightBlockError(last.error));

  if (!needsRetry) {
    return last;
  }

  if (mlPlaywrightSharedSessionAls.getStore()) {
    return last;
  }

  return runPlaywrightHeadedInteractive(url);
}

export type OpenMercadoLivreLoginWindowResult =
  | { ok: true; userDataDir: string; storageStatePath: string }
  | { ok: false; error: string; details?: string };

/**
 * Abre o Chromium no mesmo modo do sync (perfil `.playwright/ml-user-data`), para login/captcha manual.
 * Usa a fila `enqueuePersistentProfileLaunch` para não conflitar com a sincronização.
 */
export async function openMercadoLivreLoginWindow(): Promise<OpenMercadoLivreLoginWindowResult> {
  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("manual-login");
  /** Segunda passagem: `syncX11DisplayFromEnv` pode preencher DISPLAY/XAUTHORITY após inferir socket. */
  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("manual-login-after-resync");

  const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
  const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
  const absDir = path.resolve(process.cwd(), userDataDir);
  mkdirSync(absDir, { recursive: true });
  mkdirSync(path.dirname(path.resolve(process.cwd(), storageStatePath)), { recursive: true });

  /**
   * Igual ao `runWithMlPlaywrightBrowserSession`: `headless = !hasDisplayForHeadedChromium()`.
   * Sem X11/Wayland o sync corre em **headless** (não abre janela). Login manual **precisa** de janela:
   * lançar headed sem servidor X rebenta o Chromium (erro Playwright sobre XServer).
   * Falhamos cedo com mensagem acionável em vez de crash no launch.
   */
  if (!hasDisplayForHeadedChromium()) {
    const why = getLinuxHeadedChromiumUnavailableReason();
    const debug = getXauthorityDiscoveryDebug();
    return {
      ok: false,
      error:
        "Login manual no servidor requer sessão gráfica (X11 ou Wayland). Neste ambiente o Node não vê DISPLAY/cookie X11 — a sincronização pode correr em headless sem janela; para abrir o browser aqui, monte o X11 no contentor e defina ML_PLAYWRIGHT_XAUTHORITY_FILE (ver detalhes).",
      details: [why, debug].filter(Boolean).join("\n\n").trim() || undefined,
    };
  }

  const headless = false;

  try {
    return await enqueuePersistentProfileLaunch(absDir, async () => {
      const { chromium } = await import("playwright");
      const launchExtra = playwrightExecutableOrChannel();
      const chromiumArgs = buildChromiumLaunchArgs(headless);
      logChromiumLaunch(headless, launchExtra, chromiumArgs);

      const context = await chromium.launchPersistentContext(absDir, {
        ...launchExtra,
        headless,
        chromiumSandbox: false,
        env: playwrightBrowserEnv(),
        args: chromiumArgs,
        ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
        locale: "pt-BR",
        viewport: mlViewport(),
        userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
        extraHTTPHeaders: mlExtraHttpHeaders(),
        timezoneId: "America/Sao_Paulo",
      });
      await attachMlStealth(context);

      try {
        const page = context.pages()[0] || (await context.newPage());
        await page.goto("https://www.mercadolivre.com.br/", { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForEvent("close", { timeout: 0 });
      } finally {
        await context
          .storageState({ path: path.resolve(process.cwd(), storageStatePath) })
          .catch(() => {});
        await context.close().catch(() => {});
      }

      return { ok: true as const, userDataDir, storageStatePath };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg,
      details:
        `${getLinuxHeadedChromiumUnavailableReason() ?? ""}\n${getXauthorityDiscoveryDebug()}`.trim(),
    };
  }
}

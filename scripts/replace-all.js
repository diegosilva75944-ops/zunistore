#!/usr/bin/env node
/**
 * Replace em todos os arquivos do repositório
 *
 * Uso:
 *   node scripts/replace-all.js "texto a buscar" "texto substituto"
 *   node scripts/replace-all.js --regex "padrão" "substituição"
 *   node scripts/replace-all.js --dry-run "buscar" "substituir"  (só mostra, não altera)
 *
 * Exclui: node_modules, .git, .next, arquivos binários
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const useRegex = args.includes("--regex");
const filtered = args.filter((a) => a !== "--dry-run" && a !== "--regex");

if (filtered.length < 2) {
  console.log(`
Uso:
  node scripts/replace-all.js "buscar" "substituir"
  node scripts/replace-all.js --regex "padrão" "substituição"
  node scripts/replace-all.js --dry-run "buscar" "substituir"

Opções:
  --dry-run   Mostra o que seria alterado, sem modificar
  --regex     Usa expressão regular (primeiro arg) e substituição (segundo arg)
`);
  process.exit(1);
}

const search = filtered[0];
const replace = filtered[1];

const root = path.resolve(__dirname, "..");
const ignoreDirs = new Set(["node_modules", ".git", ".next", "dist", "build"]);
const ignoreExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".pdf", ".zip"]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ignoreExtensions.has(ext)) return false;
  return true;
}

function getAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!ignoreDirs.has(ent.name)) getAllFiles(full, files);
    } else if (ent.isFile() && isTextFile(full)) {
      files.push(full);
    }
  }
  return files;
}

function replaceInFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { changed: false, count: 0 };
  }

  let newContent;
  let count = 0;

  if (useRegex) {
    const regex = new RegExp(search, "g");
    const matches = content.match(regex);
    count = matches ? matches.length : 0;
    newContent = content.replace(regex, replace);
  } else {
    const parts = content.split(search);
    count = parts.length - 1;
    newContent = parts.join(replace);
  }

  const changed = count > 0 && newContent !== content;
  if (changed && !dryRun) {
    fs.writeFileSync(filePath, newContent, "utf8");
  }
  return { changed, count };
}

const files = getAllFiles(root);
let totalFiles = 0;
let totalReplacements = 0;

for (const file of files) {
  const rel = path.relative(root, file);
  const { changed, count } = replaceInFile(file);
  if (changed) {
    totalFiles += 1;
    totalReplacements += count;
    console.log(`${dryRun ? "[dry-run] " : ""}${rel} (${count} substituição${count > 1 ? "ões" : ""})`);
  }
}

console.log(`\n${dryRun ? "Seria alterado: " : "Alterado: "}${totalFiles} arquivo(s), ${totalReplacements} substituição(ões)`);

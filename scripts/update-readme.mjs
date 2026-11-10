/**
 * Regenera los bloques dinámicos del README leyendo la API de GitHub.
 * Sin dependencias: solo Node 18+ (fetch nativo).
 *
 * Reemplaza el contenido entre los marcadores:
 *   <!-- STATS:START -->    ... <!-- STATS:END -->
 *   <!-- LANGS:START -->    ... <!-- LANGS:END -->
 *   <!-- PROJECTS:START --> ... <!-- PROJECTS:END -->
 */

import { readFileSync, writeFileSync } from "node:fs";

const USER = "Cristian-Mtzzz";
const README = "README.md";
const BAR_WIDTH = 24;
const TOP_LANGS = 5;
const TOP_PROJECTS = 6;

// Lenguajes que GitHub detecta por archivos sueltos de configuración y
// que no representan trabajo real. Se suman dentro de "Otros".
const RUIDO = new Set(["Go Template", "Smarty", "Dockerfile", "Procfile"]);

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${USER}-readme-bot`,
  ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} en ${path}`);
  return res.json();
}

/** true si la URL responde 200 (para no publicar enlaces rotos) */
async function vive(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.status === 200;
  } catch {
    return false;
  }
}

function barra(pct) {
  let n = Math.round((pct * BAR_WIDTH) / 100);
  if (n < 1) n = 1;
  if (n > BAR_WIDTH) n = BAR_WIDTH;
  return "█".repeat(n) + "░".repeat(BAR_WIDTH - n);
}

function reemplazar(texto, marcador, contenido) {
  const re = new RegExp(
    `(<!-- ${marcador}:START -->)[\\s\\S]*?(<!-- ${marcador}:END -->)`
  );
  if (!re.test(texto)) throw new Error(`No encontré el marcador ${marcador} en ${README}`);
  return texto.replace(re, `$1\n${contenido}\n$2`);
}

// ---------------------------------------------------------------- datos

const user = await api(`/users/${USER}`);
const repos = await api(`/users/${USER}/repos?per_page=100&type=owner`);

const propios = repos.filter((r) => !r.fork && !r.archived && r.name !== USER);

// --- lenguajes: suma de bytes reales de cada repo
const bytes = {};
for (const r of propios) {
  const langs = await api(`/repos/${USER}/${r.name}/languages`);
  for (const [lang, n] of Object.entries(langs)) {
    bytes[lang] = (bytes[lang] || 0) + n;
  }
}

const total = Object.values(bytes).reduce((a, b) => a + b, 0);
const ordenados = Object.entries(bytes)
  .filter(([lang]) => !RUIDO.has(lang))
  .sort((a, b) => b[1] - a[1]);

const principales = ordenados.slice(0, TOP_LANGS);
const restoBytes = total - principales.reduce((a, [, n]) => a + n, 0);

const filas = principales.map(([lang, n]) => [lang, (n * 100) / total]);
if (restoBytes > 0) filas.push(["Otros", (restoBytes * 100) / total]);

const ancho = Math.max(...filas.map(([l]) => l.length));
const langsBlock = [
  "```text",
  ...filas.map(
    ([lang, pct]) =>
      `${lang.padEnd(ancho)}  ${barra(pct)}  ${pct.toFixed(1).padStart(5)}%`
  ),
  "```",
].join("\n");

// --- estadísticas generales
const estrellas = propios.reduce((a, r) => a + r.stargazers_count, 0);
const lenguajePrincipal = principales[0]?.[0] ?? "—";

const badge = (etiqueta, valor, color) =>
  `![${etiqueta}](https://img.shields.io/badge/${encodeURIComponent(
    etiqueta
  )}-${encodeURIComponent(String(valor))}-${color}?style=flat)`;

const statsBlock = [
  badge("Repos públicos", user.public_repos, "0e75b6"),
  badge("Estrellas", estrellas, "f1c40f"),
  badge("Seguidores", user.followers, "9b59b6"),
  badge("Lenguaje principal", lenguajePrincipal, "2ecc71"),
].join("\n");

// --- proyectos: los más recientes, con enlace en vivo si realmente responde
const recientes = propios
  .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
  .slice(0, TOP_PROJECTS);

const lineas = [];
for (const r of recientes) {
  const candidata =
    r.homepage?.trim() ||
    (r.has_pages ? `https://${USER.toLowerCase()}.github.io/${r.name}/` : null);
  const demo = candidata && (await vive(candidata)) ? ` · [ver en vivo](${candidata})` : "";
  const nombre = r.name.replace(/[-_]/g, " ");
  const desc = r.description?.trim() || "—";
  const stack = r.language || "—";
  lineas.push(`| [${nombre}](${r.html_url})${demo} | ${desc} | ${stack} |`);
}

const projectsBlock = [
  "| Proyecto | Descripción | Stack |",
  "|---|---|---|",
  ...lineas,
].join("\n");

// ---------------------------------------------------------------- escribir

let texto = readFileSync(README, "utf8");
texto = reemplazar(texto, "STATS", statsBlock);
texto = reemplazar(texto, "LANGS", langsBlock);
texto = reemplazar(texto, "PROJECTS", projectsBlock);
writeFileSync(README, texto);

console.log(`README actualizado:`);
console.log(`  ${propios.length} repos, ${estrellas} estrellas, ${user.followers} seguidores`);
console.log(`  lenguajes: ${filas.map(([l, p]) => `${l} ${p.toFixed(1)}%`).join(", ")}`);
console.log(`  proyectos listados: ${recientes.length}`);

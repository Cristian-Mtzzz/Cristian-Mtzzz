/**
 * Regenera los bloques dinámicos del README leyendo la API de GitHub.
 * Sin dependencias: solo Node 18+ (fetch nativo).
 *
 * Reemplaza el contenido entre los marcadores:
 *   <!-- LANGS:START -->    ... <!-- LANGS:END -->
 *   <!-- PROJECTS:START --> ... <!-- PROJECTS:END -->
 *
 * Las estadísticas generales (repos, seguidores, último commit) NO se generan
 * aquí: son badges que consultan la API de GitHub en vivo, así que no
 * necesitan que este script corra.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const USER = "Cristian-Mtzzz";
const README = "README.md";
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

/** Colores oficiales de GitHub (linguist) para cada lenguaje */
const COLORES = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  "C#": "#178600",
  CSS: "#663399",
  HTML: "#e34c26",
  PHP: "#4F5D95",
  Less: "#1d365d",
  Java: "#b07219",
  Python: "#3572A5",
  C: "#555555",
  "C++": "#f34b7d",
  Vue: "#41b883",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dart: "#00B4AB",
  Otros: "#8b949e",
};
const colorDe = (lang) => COLORES[lang] || "#8b949e";

const escapar = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Dibuja la tarjeta de lenguajes como SVG.
 * Se generan dos versiones (clara y oscura) y el README elige según el tema.
 */
function tarjetaSVG(filas, tema) {
  const t =
    tema === "dark"
      ? { fondo: "#0d1117", borde: "#30363d", titulo: "#58a6ff", texto: "#c9d1d9", pista: "#21262d" }
      : { fondo: "#ffffff", borde: "#d0d7de", titulo: "#0969da", texto: "#1f2328", pista: "#eaeef2" };

  const W = 495;
  const PAD = 25;
  const BARRA_W = W - PAD * 2;
  const BARRA_Y = 58;
  const BARRA_H = 10;
  const FILA_H = 26;
  const COLS = 2;
  const nFilas = Math.ceil(filas.length / COLS);
  const LEYENDA_Y = 100;
  const H = LEYENDA_Y + nFilas * FILA_H + 6;

  // segmentos de la barra apilada
  let x = 0;
  const segmentos = filas
    .map(([lang, pct]) => {
      const w = (pct / 100) * BARRA_W;
      const s = `<rect x="${(PAD + x).toFixed(2)}" y="${BARRA_Y}" width="${w.toFixed(
        2
      )}" height="${BARRA_H}" fill="${colorDe(lang)}" />`;
      x += w;
      return s;
    })
    .join("\n    ");

  // leyenda en dos columnas
  const leyenda = filas
    .map(([lang, pct], i) => {
      const col = i % COLS;
      const fila = Math.floor(i / COLS);
      const cx = PAD + col * (BARRA_W / COLS) + 6;
      const cy = LEYENDA_Y + fila * FILA_H;
      return `<circle cx="${cx}" cy="${cy - 4}" r="5" fill="${colorDe(lang)}" />
    <text x="${cx + 14}" y="${cy}" class="etiqueta">${escapar(lang)}</text>
    <text x="${cx + 14 + (BARRA_W / COLS - 60)}" y="${cy}" class="valor">${pct.toFixed(
        1
      )}%</text>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lenguajes más usados">
  <style>
    .titulo { font: 600 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.titulo}; }
    .etiqueta { font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.texto}; }
    .valor { font: 600 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.texto}; text-anchor: end; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.fondo}" stroke="${t.borde}" />
  <text x="${PAD}" y="35" class="titulo">Lenguajes más usados</text>
  <rect x="${PAD}" y="${BARRA_Y}" width="${BARRA_W}" height="${BARRA_H}" rx="${BARRA_H / 2}" fill="${t.pista}" />
  <g clip-path="url(#recorte)">
    ${segmentos}
  </g>
  <defs>
    <clipPath id="recorte">
      <rect x="${PAD}" y="${BARRA_Y}" width="${BARRA_W}" height="${BARRA_H}" rx="${BARRA_H / 2}" />
    </clipPath>
  </defs>
  <g>
    ${leyenda}
  </g>
</svg>
`;
}

/**
 * Reemplaza lo que haya entre los marcadores. Si el marcador no está, se
 * salta ese bloque sin fallar: así podés borrar una sección del README a
 * mano y el script lo respeta en vez de romperse.
 */
function reemplazar(texto, marcador, contenido) {
  const re = new RegExp(
    `(<!-- ${marcador}:START -->)[\\s\\S]*?(<!-- ${marcador}:END -->)`
  );
  if (!re.test(texto)) {
    console.log(`  (sin marcador ${marcador}: esa sección se omite)`);
    return texto;
  }
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

mkdirSync("assets", { recursive: true });
const svgClaro = tarjetaSVG(filas, "light");
const svgOscuro = tarjetaSVG(filas, "dark");
writeFileSync("assets/lenguajes-light.svg", svgClaro);
writeFileSync("assets/lenguajes-dark.svg", svgOscuro);

// GitHub cachea las imágenes en su proxy. Un parámetro que cambia con el
// contenido obliga a recargarlas cuando los porcentajes se mueven.
const v = createHash("sha1").update(svgOscuro).digest("hex").slice(0, 8);
const crudo = `https://raw.githubusercontent.com/${USER}/${USER}/main/assets`;

const langsBlock = `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${crudo}/lenguajes-dark.svg?v=${v}">
  <source media="(prefers-color-scheme: light)" srcset="${crudo}/lenguajes-light.svg?v=${v}">
  <img alt="Lenguajes más usados" src="${crudo}/lenguajes-light.svg?v=${v}">
</picture>`;

const estrellas = propios.reduce((a, r) => a + r.stargazers_count, 0);

let texto = readFileSync(README, "utf8");

// --- proyectos: los más recientes, con enlace en vivo si realmente responde.
// Solo se calcula si la sección existe en el README (se puede borrar a mano).
const hayProyectos = texto.includes("<!-- PROJECTS:START -->");
const recientes = hayProyectos
  ? propios
      .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, TOP_PROJECTS)
  : [];

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

texto = reemplazar(texto, "LANGS", langsBlock);
texto = reemplazar(texto, "PROJECTS", projectsBlock);
writeFileSync(README, texto);

console.log(`README actualizado:`);
console.log(`  ${propios.length} repos, ${estrellas} estrellas, ${user.followers} seguidores`);
console.log(`  lenguajes: ${filas.map(([l, p]) => `${l} ${p.toFixed(1)}%`).join(", ")}`);
console.log(`  proyectos listados: ${recientes.length}`);

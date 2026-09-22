// Lightweight publication hygiene. This does not replace a dedicated secret scan.
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, statSync } = require("node:fs");
const { dirname, isAbsolute, relative, resolve, sep } = require("node:path");

const root = resolve(__dirname, "..");
const paths = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
      .split("\0")
      .filter(Boolean),
  ),
].filter((file) => existsSync(resolve(root, file)));
const candidates = new Set(paths.map((file) => file.replaceAll("\\", "/")));
const issues = [];
for (const file of paths) {
  const normalized = file.replaceAll("\\", "/");
  if (
    /(^|\/)(node_modules|dist|coverage|test-results|playwright-report|\.vercel)(\/|$)/.test(
      normalized,
    ) ||
    (/(^|\/)\.env(?:\.[^/]+)?$/.test(normalized) &&
      !normalized.endsWith(".env.example")) ||
    /\.(dump|backup|pem|key|p12|log)$/.test(normalized) ||
    /(^|\/)[^/]+\.local(\/|$)/.test(normalized)
  )
    issues.push(`${file}: fichier local ou sensible sélectionné`);
  if (statSync(resolve(root, file)).size > 5 * 1024 * 1024)
    issues.push(`${file}: fichier supérieur à 5 Mio`);
  if (!file.endsWith(".md")) continue;
  const markdown = readFileSync(resolve(root, file), "utf8");
  for (const match of markdown.matchAll(
    /\[[^\]]*\]\(([^\s)]+)(?:\s+["'][^)]*)?\)/g,
  )) {
    const target = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const absolute = resolve(
      dirname(resolve(root, file)),
      decodeURIComponent(target),
    );
    const repoPath = relative(root, absolute);
    if (
      isAbsolute(repoPath) ||
      repoPath === ".." ||
      repoPath.startsWith(`..${sep}`) ||
      !candidates.has(repoPath.split(sep).join("/"))
    )
      issues.push(`${file}: lien local non publiable (${target})`);
  }
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.info(
    `Hygiène du dépôt : ${paths.length} fichiers, liens locaux et exclusions vérifiés.`,
  );
}

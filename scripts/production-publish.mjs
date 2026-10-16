// Prepares a clean publication commit. It never pushes or changes the working index/HEAD.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
fs.mkdirSync(".production", { recursive: true });
const index = path.resolve(
  ".production/publish-" + crypto.randomUUID() + ".index",
);
const env = { ...process.env, GIT_INDEX_FILE: index };
function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) throw new Error("Git: " + result.stderr);
  return result.stdout;
}
const headBefore = git(["rev-parse", "HEAD"]).trim();
const ordinaryIndex = path.join(root, ".git", "index");
const indexHash = fs.existsSync(ordinaryIndex)
  ? crypto
      .createHash("sha256")
      .update(fs.readFileSync(ordinaryIndex))
      .digest("hex")
  : null;
try {
  git(["read-tree", "--empty"]);
  const paths = [
    ".env.example",
    ".gitignore",
    "README.md",
    "DEPLOY-VERCEL.md",
    "package.json",
    "package-lock.json",
    "server.js",
    "next-env.d.ts",
    "next.config.ts",
    "tsconfig.json",
    "eslint.config.mjs",
    "postcss.config.mjs",
    "vercel.json",
    "commerce.json",
    "public",
    "lib",
    "src",
    "production",
    "database",
    "integrations",
    "admin",
    "catalog",
    "scripts",
    "templates",
    "tests",
    "examples",
    "requirements-mercadopago.txt",
  ];
  git(["add", "--all", "--", ...paths]);
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  if (
    files.some((file) =>
      /(^|\/)(\.env(?:\.(?!example$).*)?|\.production|node_modules|state|\.next|__pycache__)(\/|$)|config\.local\.json$|private-reported-costs/.test(
        file,
      ),
    )
  )
    throw new Error(
      "Arquivo privado encontrado na seleção. Publicação interrompida.",
    );
  const secrets = new Set();
  for (const file of [
    ".env",
    ".production/owner-access.json",
    "integrations/corel-worker/config.local.json",
  ]) {
    if (!fs.existsSync(file)) continue;
    const contents = fs.readFileSync(file, "utf8");
    if (file.endsWith(".json")) {
      const value = JSON.parse(contents);
      for (const key of ["password", "credential"])
        if (typeof value[key] === "string" && value[key].length >= 16)
          secrets.add(value[key]);
    } else
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
        if (match && /SECRET|TOKEN|KEY|PASSWORD/i.test(match[1])) {
          const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
          if (value.length >= 16) secrets.add(value);
        }
      }
  }
  const leaks = [];
  let total = 0;
  for (const file of files) {
    const bytes = git(["show", ":" + file], { encoding: "buffer" });
    total += bytes.length;
    if (bytes.length > 90 * 1024 * 1024)
      throw new Error("Arquivo grande demais: " + file);
    if ([...secrets].some((secret) => bytes.includes(Buffer.from(secret))))
      leaks.push(file);
    if (
      !bytes.includes(0) &&
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sb_secret_[A-Za-z0-9_-]{25,}|sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{40,})/.test(
        bytes.toString(),
      )
    )
      leaks.push(file);
  }
  if (leaks.length)
    throw new Error(
      "Credencial detectada em: " + [...new Set(leaks)].join(", "),
    );
  const tree = git(["write-tree"]).trim();
  const previous = git([
    "for-each-ref",
    "--format=%(objectname)",
    "refs/heads/publicacao-producao",
  ]).trim();
  const commit = git([
    "commit-tree",
    tree,
    ...(previous ? ["-p", previous] : []),
    "-m",
    "Produção UP: painel privado, assistente, fila, nesting e conector Windows; pronto para Vercel",
  ]).trim();
  git(["update-ref", "refs/heads/publicacao-producao", commit]);
  const report = {
    commit,
    branch: "publicacao-producao",
    files: files.length,
    megabytes: +(total / 1024 / 1024).toFixed(2),
    secretMatches: 0,
    workingHeadPreserved: git(["rev-parse", "HEAD"]).trim() === headBefore,
    workingIndexPreserved:
      indexHash ===
      (fs.existsSync(ordinaryIndex)
        ? crypto
            .createHash("sha256")
            .update(fs.readFileSync(ordinaryIndex))
            .digest("hex")
        : null),
  };
  if (!report.workingHeadPreserved || !report.workingIndexPreserved)
    throw new Error("Estado de trabalho foi alterado.");
  fs.writeFileSync(
    ".production/publication.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  fs.rmSync(index, { force: true });
}

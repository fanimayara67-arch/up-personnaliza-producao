import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
fs.mkdirSync(".production", { recursive: true });
const index = path.resolve(".production/checkpoint.index");
if (fs.existsSync(index))
  throw new Error("Índice temporário já existe. Confira antes de repetir.");
const env = {
  ...process.env,
  GIT_INDEX_FILE: index,
  GIT_AUTHOR_NAME: "Codex local checkpoint",
  GIT_AUTHOR_EMAIL: "checkpoint@localhost",
  GIT_COMMITTER_NAME: "Codex local checkpoint",
  GIT_COMMITTER_EMAIL: "checkpoint@localhost",
};
function git(args) {
  const r = spawnSync("git", args, { env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
try {
  const head = git(["rev-parse", "HEAD"]);
  git(["read-tree", "HEAD"]);
  const paths = [
    ".env.example",
    ".gitignore",
    "README.md",
    "package.json",
    "server.js",
    "public",
    "lib",
    "admin",
    "catalog",
    "database",
    "integrations",
    "production",
    "scripts",
    "templates",
    "tests",
    "requirements-mercadopago.txt",
  ].filter((p) => fs.existsSync(p));
  git(["add", "--all", "--", ...paths]);
  const tree = git(["write-tree"]);
  const commit = git([
    "commit-tree",
    tree,
    "-p",
    head,
    "-m",
    "Checkpoint local antes da migração Next.js e Produção UP",
  ]);
  const ref = "checkpoint/pre-next-production-" + Date.now();
  git(["branch", ref, commit]);
  console.log(
    "Checkpoint criado: " +
      ref +
      " (" +
      commit.slice(0, 12) +
      "). HEAD e índice de trabalho preservados.",
  );
} finally {
  fs.rmSync(index, { force: true });
}

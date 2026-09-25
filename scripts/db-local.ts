/**
 * Postgres lokal untuk development & E2E, tanpa install/password.
 * Data disimpan di .pgdata/.
 *   npm run db:local        -> start (server jalan di background)
 *   npm run db:local stop   -> stop
 *
 * Start/stop lewat pg_ctl (bukan embedded-postgres.start) karena pg_ctl
 * otomatis menurunkan hak akses saat dijalankan dari akun Windows admin.
 * Binary disalin ke .pgbin/ lalu dijalankan dari sana, supaya server yang sedang
 * berjalan tidak mengunci file di node_modules (npm ci/install akan gagal EPERM).
 */
import EmbeddedPostgres from "embedded-postgres";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const DB_NAME = "asisten_pesanan";
const dataDir = path.resolve(".pgdata");

const platformDir = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const packagedNative = path.resolve("node_modules/@embedded-postgres", platformDir, "native");
const binCopy = path.resolve(".pgbin");
const pgCtl = path.join(binCopy, "bin", process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");

function ensureBinaries() {
  if (!existsSync(pgCtl)) cpSync(packagedNative, binCopy, { recursive: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  onLog: () => {},
});

function isRunning(): boolean {
  if (!existsSync(pgCtl)) return false;
  try {
    execFileSync(pgCtl, ["status", "-D", dataDir], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function start() {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  ensureBinaries();
  if (!isRunning()) {
    // stdio "ignore": server mewarisi handle stdio; kalau "inherit", pipe pemanggil tidak pernah tertutup.
    // Log server ada di .pgdata/server.log.
    execFileSync(pgCtl, ["start", "-w", "-D", dataDir, "-o", `-p ${PORT}`, "-l", path.join(dataDir, "server.log")], {
      stdio: "ignore",
    });
  }
  try {
    await pg.createDatabase(DB_NAME);
  } catch {
    // database sudah ada
  }
  console.log(`Postgres lokal siap: postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
}

function stop() {
  if (isRunning()) execFileSync(pgCtl, ["stop", "-w", "-D", dataDir], { stdio: "inherit" });
  else console.log("Postgres lokal tidak sedang berjalan.");
}

const cmd = process.argv[2] ?? "start";
if (cmd === "stop") {
  stop();
} else {
  start().catch((err) => {
    console.error("Gagal menjalankan Postgres lokal:", err);
    process.exit(1);
  });
}

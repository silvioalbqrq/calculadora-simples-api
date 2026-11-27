import { spawn } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORTA = Number(process.env.PORT || 10000);
const RAIZ = path.resolve(import.meta.dirname, "..");
const JAVA = process.env.JAVA_EXE || path.join(RAIZ, ".ferramentas", "jdk-25.0.5.1+2", "bin", "java.exe");
const JAR = path.join(RAIZ, "motor-simples", "target", "api-simples-nacional.jar");
const JAR_DIR = path.dirname(JAR);

// O SQLite nao abre caminho com espaco ("Default Project"): quando houver, aponta o datasource para ele.
const NOMEDB = "calculadora-pro.db";
const DB = path.join(JAR_DIR, "..", "calculadora", "db", NOMEDB);

// .env (CHAVE="valor com espacos"): variaveis ja no ambiente tem prioridade.
function lerEnv(arquivo) {
  const fora = {};
  try {
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/);
      // # no inicio e comentario; dentro do valor e literal.
      if (m && !m[1].startsWith("#")) fora[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
    }
  } catch {}
  return fora;
}

const envFile = lerEnv(path.join(path.dirname(import.meta.dirname), "calculadora-service", ".env"));
const env = { ...envFile, ...process.env };
// O app abre o SQLite em ./calculadora/db relativo ao cwd (motor-simples/target),
// onde a base nao esta (ela fica em motor-simples/calculadora/db). Sem isso o
// boot morre no datasource e o Render fica em "no-deploy". Aponta sempre para o
// arquivo real; um SPRING_DATASOURCE_URL explicito no ambiente tem prioridade.
if (!env.SPRING_DATASOURCE_URL) {
  env.SPRING_DATASOURCE_URL = "jdbc:sqlite:file:" + DB + "?mode=ro&date_class=TEXT&date_string_format=yyyy-MM-dd";
}

env.ORIGENS_PERMITIDAS = env.ORIGENS_PERMITIDAS || "http://localhost:8081,http://127.0.0.1:8081";
env.APP_CORS_ALLOWED_ORIGINS = env.ORIGENS_PERMITIDAS;
env.APP_CORS_ALLOW_CREDENTIALS = "false";
env.SPRING_PROFILES_ACTIVE = env.SPRING_PROFILES_ACTIVE || "offline";
env.SERVER_PORT = String(PORTA);
// A porta de metricas nao pode ser a de outro motor: sem porta propria, o actuator fica no mesmo servidor.
if (process.env.METRICAS_PORT) env.MANAGEMENT_SERVER_PORT = process.env.METRICAS_PORT;
else env.MANAGEMENT_SERVER_PORT = "";

// .env tambem pode definir JAVA_EXE; por isso usa o env mesclado, nao process.env.
const exe = env.JAVA_EXE || JAVA;
// O plano gratuito do Render tem 512 MB no total: -Xmx512m somado a metaspace e
// stack estoura e o container morre no boot (port scan timeout / 502). O padrao
// deixa folga; quem tem mais memoria sobe JAVA_MEM (ex.: 768m).
const MEMORIA = process.env.JAVA_MEM || "320m";
const filho = spawn(
  exe,
  [
    "-Xmx" + MEMORIA,
    "-XX:MaxMetaspaceSize=128m",
    "-XX:+UseSerialGC",
    "-XX:TieredStopAtLevel=1",
    "-Djava.awt.headless=true",
    "-jar", JAR,
    "--server.port=" + PORTA,
  ],
  {
    cwd: JAR_DIR,
    env,
    stdio: "inherit",
  }
);
console.log("Motor: " + JAR + " | porta " + PORTA + " | heap " + MEMORIA + " | CORS " + env.ORIGENS_PERMITIDAS);

// Supabase pode dormir: mantem acordado com 1 GET de minuto em minuto (falha em silencio).
if (process.env.ACORDAR_URL) {
  const acordar = () => fetch(process.env.ACORDAR_URL, { method: "GET" }).catch(() => {});
  acordar();
  const timer = setInterval(acordar, 60000);
  timer.unref();
}

function encerrar() {
  filho.kill("SIGTERM");
  setTimeout(() => filho.kill("SIGKILL"), 5000).unref();
}
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);
filho.on("exit", (codigo) => process.exit(codigo == null ? 1 : codigo));
filho.on("error", (e) => {
  console.error("Falha ao iniciar o motor: " + e.message);
  process.exit(1);
});

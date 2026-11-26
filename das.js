// DAS estimado pela LC 123/2006 (Anexos I a V) + fração de CBS do DAS.
// Fonte única: o front (app.js) busca este arquivo; o servidor (calculadora-service/server.mjs vitrine) usa o mesmo arquivo para o DAS.
// cbs = fração média do DAS correspondente a PIS+Cofins em 2027 (vira CBS), estimativa.
const ANEXOS = {
  I: { cbs: 15.5, faixas: [[180000, 4, 0], [360000, 7.3, 5940], [720000, 9.5, 13860], [1800000, 10.7, 22500], [3600000, 14.3, 87300], [4800000, 19, 378000]] },
  II: { cbs: 15, faixas: [[180000, 4.5, 0], [360000, 7.8, 5940], [720000, 10, 13860], [1800000, 11.2, 22500], [3600000, 14.7, 85500], [4800000, 30, 720000]] },
  III: { cbs: 14.5, faixas: [[180000, 6, 0], [360000, 11.2, 9360], [720000, 13.5, 17640], [1800000, 16, 35640], [3600000, 21, 125640], [4800000, 33, 648000]] },
  IV: { cbs: 16, faixas: [[180000, 4.5, 0], [360000, 9, 8100], [720000, 10.2, 12420], [1800000, 14, 39780], [3600000, 22, 183780], [4800000, 33, 828000]] },
  V: { cbs: 14, faixas: [[180000, 15.5, 0], [360000, 18, 4500], [720000, 19.5, 9900], [1800000, 20.5, 17100], [3600000, 23, 62100], [4800000, 30.5, 540000]] },
};
const LIMITE = 4800000;
const SUBLIMITE = 3600000;

function parseNum(v) {
  const s = String(v == null ? "" : v).trim().replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  if (!s.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function calcularDas(rbt12, anexo, codAtiv) {
  if (codAtiv === "90") return { zero: true };
  if (!(rbt12 > 0) || !ANEXOS[anexo]) return null;
  const t = ANEXOS[anexo];
  const f = t.faixas.find((x) => rbt12 <= x[0]) || t.faixas[t.faixas.length - 1];
  const efetiva = ((rbt12 * f[1] / 100 - f[2]) / rbt12) * 100;
  return { rbt12, anexo, efetiva, cbsRate: efetiva * t.cbs / 100 };
}

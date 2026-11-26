import { ecToGc, gcToEc } from "./ethiopian.js";

export const partsOf = (iso) => {
  const ec = iso ? gcToEc(iso) : null;
  return ec ? { d: String(ec.day), m: String(ec.month), y: String(ec.year) } : { d: "", m: "", y: "" };
};

// Reads the three boxes of an Ethiopian date -> { iso, status }. status: empty | incomplete | invalid | range | ok
export function readEcParts(p, min, max) {
  if (!p.d && !p.m && !p.y) return { iso: "", status: "empty" };
  if (!p.d || !p.m || !p.y) return { iso: "", status: "incomplete" };
  const iso = ecToGc(Number(p.y), Number(p.m), Number(p.d));
  if (!iso) return { iso: "", status: "invalid" };
  if ((min && iso < min) || (max && iso > max)) return { iso: "", status: "range", gc: iso };
  return { iso, status: "ok" };
}

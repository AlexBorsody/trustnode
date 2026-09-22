import { canonicalProjection } from "./rank";
import { compareId, requireGraph, roundCanonical } from "./types";
import type { GraphProjection, TrustResult } from "./types";

/** Stable JSON key order, independent of caller object construction order. */
function serialize(value: unknown, round: boolean): string {
  if (typeof value === "number") {
    requireGraph(Number.isFinite(value), "numerical_failure", "Nonfinite values cannot be exported.");
    return JSON.stringify(round ? roundCanonical(value) : value);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => serialize(item, round)).join(",")}]`;
  requireGraph(value && typeof value === "object", "invalid_input", "Only JSON values can be exported.");
  return `{${Object.keys(value).sort(compareId).map(key => `${JSON.stringify(key)}:${serialize((value as Record<string, unknown>)[key], round)}`).join(",")}}`;
}
/** Keep full input precision; rounding seed weights would change replay inputs. */
export const serializeProjection = (input: GraphProjection) => serialize(canonicalProjection(input), false);
/** Raw results remain available; the canonical exported result uses 12 decimals. */
export const serializeTrustResult = (result: TrustResult) => serialize(result, true);

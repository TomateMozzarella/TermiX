import { describe, expect, it } from "vitest";
import cases from "./address-cases.json";
import { normalizeAddress } from "./address";
describe("SSH address normalization contract", () => {
  for (const row of cases) it(row.input || "empty address", () => {
    if (row.error) { try { normalizeAddress(row.input, row.fallback); throw new Error("Expected rejection"); } catch (e) { expect(e).toBe(row.error); } }
    else expect(normalizeAddress(row.input, row.fallback)).toEqual({ host: row.host, port: row.port });
  });
});

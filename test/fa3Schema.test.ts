// Сгенерированные фактуры должны проходить официальную XSD FA(3).
// Нужен xmllint (libxml2-utils); без него тест пропускается.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTestInvoice } from "../src/ksef/testInvoice.ts";

const XSD = fileURLToPath(new URL("../schemas/fa3/fa3.xsd", import.meta.url));
const hasXmllint = spawnSync("xmllint", ["--version"]).status === 0;

for (const kind of ["eu", "domestic"] as const) {
  test(`тестовая фактура (${kind}) проходит XSD FA(3)`, { skip: !hasXmllint && "нет xmllint" }, () => {
    const dir = mkdtempSync(join(tmpdir(), "fa3-"));
    try {
      const file = join(dir, "f.xml");
      writeFileSync(
        file,
        buildTestInvoice({
          sellerNip: "5265877635",
          number: "FV/1/10/2026",
          issueDate: "2026-10-14",
          serviceFrom: "2026-10-01",
          serviceTo: "2026-10-14",
          kind,
          net: "4500.00",
        }),
      );
      const out = execFileSync("xmllint", ["--noout", "--schema", XSD, file], { encoding: "utf8", stdio: "pipe" });
      assert.equal(out, "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

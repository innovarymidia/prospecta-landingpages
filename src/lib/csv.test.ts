import test from "node:test";
import assert from "node:assert/strict";
import { parseCsvMatrix, parseLeadsFromCsv } from "./csv.ts";

test("parseCsvMatrix handles UTF-8 BOM, semicolons and quoted fields with commas", () => {
  const csv =
    '\uFEFFempresa;whatsapp;site;cidade;nota;avaliacoes\r\n' +
    '"Locadora Alfa, Ltda";(19) 99999-1111;;"Campinas, SP";4,8;32\r\n' +
    'Beta Máquinas;11988882222;https://betamaquinas.com.br;São Paulo, SP;4.7;18\r\n';

  const matrix = parseCsvMatrix(csv);
  assert.equal(matrix.length, 3);
  assert.equal(matrix[1][0], "Locadora Alfa, Ltda");
  assert.equal(matrix[1][3], "Campinas, SP");

  const { candidates, parsedRows } = parseLeadsFromCsv(csv, "Planilha Campinas");
  assert.equal(parsedRows, 2);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].company, "Locadora Alfa, Ltda");
  assert.equal(candidates[0].name, "Locadora Alfa, Ltda");
  assert.equal(candidates[0].rating, 4.8);
  assert.equal(candidates[0].reviewsCount, 32);
  assert.equal(candidates[0].source, "Planilha Campinas");
});

test("parseLeadsFromCsv maps English headers, separate contact name and escaped quotes", () => {
  const csv = [
    "company,name,phone,website,category,rating,reviewsCount",
    '"Forte ""Locadora""",Carlos,(11) 97777-3333,https://instagram.com/forteloc,Andaimes,4.5,14',
    ",,,,",
  ].join("\n");

  const { candidates, parsedRows } = parseLeadsFromCsv(csv);
  assert.equal(parsedRows, 1);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].company, 'Forte "Locadora"');
  assert.equal(candidates[0].name, "Carlos");
  assert.equal(candidates[0].website, "https://instagram.com/forteloc");
  assert.equal(candidates[0].reviewsCount, 14);
});


import test from "node:test";
import assert from "node:assert/strict";
import { parseSerperPlaces } from "./serper.ts";
import { filterQualifiedCandidates } from "./lead-import.ts";

test("parseSerperPlaces maps Google Maps results from Serper API into normalized candidates", () => {
  const body = {
    places: [
      {
        title: "Locadora Centro Equipamentos",
        address: "Av. Brasil, 500 - Campinas, SP",
        rating: 4.7,
        ratingCount: 28,
        category: "Locação de Equipamentos",
        phoneNumber: "(19) 99123-4567",
        website: "https://instagram.com/locadoracentro",
        cid: "987654321",
      },
      {
        title: "Empresa Sem Telefone",
        rating: 4.9,
        ratingCount: 40,
      },
    ],
  };

  const parsed = parseSerperPlaces(body, "locadora de equipamentos, Campinas, SP");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "Locadora Centro Equipamentos");
  assert.equal(parsed[0].providerId, "serper:987654321");
  assert.equal(parsed[0].reviewsCount, 28);
});

test("filterQualifiedCandidates filters websites, invalid 0800 phones and deduplicates batch", () => {
  const result = filterQualifiedCandidates(
    [
      {
        name: "Locadora Forte",
        phone: "(19) 99123-4567",
        website: "https://instagram.com/forteloc",
        rating: 4.8,
        reviewsCount: 18,
      },
      {
        name: "Locadora Forte Duplicada",
        phone: "5519991234567",
        website: null,
        rating: 4.8,
        reviewsCount: 18,
      },
      {
        name: "Central 0800",
        phone: "0800 777 1234",
        website: null,
        rating: 4.9,
        reviewsCount: 50,
      },
      {
        name: "Locadora Com Site Proprio",
        phone: "(19) 99222-3333",
        website: "https://locadorasiteproprio.com.br",
        rating: 4.9,
        reviewsCount: 50,
      },
      {
        name: "Planilha Sem Nota",
        phone: "(19) 99333-4444",
        website: null,
        rating: null,
        reviewsCount: null,
      },
    ],
    { websiteTarget: "missing", requireMapsScore: false }
  );

  assert.equal(result.qualified.length, 2);
  assert.equal(result.qualified[0].phone, "5519991234567");
  assert.equal(result.qualified[1].phone, "5519993334444");
  assert.equal(result.skippedBatchDuplicates, 1);
  assert.equal(result.skippedUnqualified, 2);

  const strict = filterQualifiedCandidates(
    [
      {
        name: "Planilha Sem Nota",
        phone: "(19) 99333-4444",
        website: null,
        rating: null,
        reviewsCount: null,
      },
      {
        name: "Qualificada Maps",
        phone: "(19) 99444-5555",
        website: "",
        rating: 4.5,
        reviewsCount: 12,
      },
    ],
    { websiteTarget: "missing", requireMapsScore: true }
  );

  assert.equal(strict.qualified.length, 1);
  assert.equal(strict.qualified[0].name, "Qualificada Maps");
  assert.equal(strict.skippedUnqualified, 1);
});


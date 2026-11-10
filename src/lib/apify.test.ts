import test from "node:test";
import assert from "node:assert/strict";
import { buildApifyRunInput, parseApifyPlaces } from "./apify.ts";
import { getActiveSearchProvider } from "./search-provider.ts";

test("buildApifyRunInput budgets results per term cleanly for free tier", () => {
  const input = buildApifyRunInput({
    searchTerms: ["locadora de equipamentos", "aluguel de andaimes", "locação de betoneiras"],
    location: "Campinas, SP",
    regionCode: "BR",
    language: "pt",
    maxResults: 25,
    websiteTarget: "missing",
  });

  assert.equal(input.maxCrawledPlacesPerSearch, 9);
  assert.equal(input.language, "pt-BR");
  assert.equal(input.website, "withoutWebsite");
  assert.equal(input.skipClosedPlaces, true);
  assert.equal(input.maxReviews, 0);
  assert.equal(input.maxImages, 0);
});

test("parseApifyPlaces maps phoneUnformatted, rating and avoids Google Maps url false websites", () => {
  const items = [
    {
      title: "Locadora Forte Máquinas",
      phoneUnformatted: "+5519999991234",
      url: "https://www.google.com/maps/place/?q=place_id:ChIJ123",
      website: null,
      address: "Rua Central, 100, Campinas - SP",
      categoryName: "Locadora de equipamentos",
      totalScore: 4.8,
      reviewsCount: 31,
      placeId: "ChIJ123",
      permanentlyClosed: false,
      searchString: "locadora de equipamentos",
      ownerDescription: "Locação de andaimes e betoneiras.",
      openingHours: [
        { day: "segunda-feira", hours: "08:00 to 17:00" },
        { day: "terça-feira", hours: "08:00 to 17:00" },
      ],
    },
    {
      title: "Empresa Fechada",
      phoneUnformatted: "+5519999995678",
      permanentlyClosed: true,
      totalScore: 4.5,
      reviewsCount: 15,
      placeId: "ChIJ999",
    },
  ];

  const parsed = parseApifyPlaces(items, "Campinas, SP");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].website, null);
  assert.equal(parsed[0].businessStatus, "OPERATIONAL");
  assert.equal(parsed[0].providerId, "apify:ChIJ123");
  assert.equal(parsed[0].rating, 4.8);
  assert.equal(parsed[0].reviewsCount, 31);
  assert.equal(parsed[0].hours, "segunda-feira: 08:00 às 17:00 · terça-feira: 08:00 às 17:00");
  assert.equal(parsed[0].notes, "Locação de andaimes e betoneiras.");
  assert.equal(parsed[1].businessStatus, "CLOSED");
});

test("getActiveSearchProvider prioritizes APIFY_TOKEN, then SERPER_API_KEY, then OUTSCRAPER_API_KEY", () => {
  assert.equal(getActiveSearchProvider({ APIFY_TOKEN: "apify_1", SERPER_API_KEY: "serp_1" }), "apify");
  assert.equal(getActiveSearchProvider({ SERPER_API_KEY: "serp_1", OUTSCRAPER_API_KEY: "out_1" }), "serper");
  assert.equal(getActiveSearchProvider({ OUTSCRAPER_API_KEY: "out_1" }), "outscraper");
  assert.equal(getActiveSearchProvider({}), null);
});


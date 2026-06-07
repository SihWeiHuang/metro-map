import { DEFAULT_MAP_VIEW } from "../src/map/defaultMapViewConstants.js";
import {
  GEO_COUNTRY_OTHER,
  GEO_COUNTRY_TW,
  GEO_REGION_GREATER_TAIPEI,
  GEO_REGION_OTHER,
  buildCityOptions,
  buildCountryOptions,
  canonicalizeCountryId,
  canonicalizeRegion,
  collectGeoPairsFromRoutes,
  formatGeoPatch,
  getCatalogMapView,
  getCityLabelKey,
  getCountryLabelKey,
  normalizeGeoMetadataPatch,
} from "../src/map/geoCatalog.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(canonicalizeCountryId("TW") === GEO_COUNTRY_TW, "TW stays TW");
assert(canonicalizeCountryId("台灣") === GEO_COUNTRY_TW, "台灣 alias → TW");
assert(canonicalizeCountryId("  ") === GEO_COUNTRY_OTHER, "blank country → other");
assert(canonicalizeRegion(" 大台北地區 ") === GEO_REGION_GREATER_TAIPEI, "trim region");
assert(canonicalizeRegion("雙北") === GEO_REGION_GREATER_TAIPEI, "legacy 雙北 alias");

const pairs = collectGeoPairsFromRoutes([
  { country: "TW", region: GEO_REGION_GREATER_TAIPEI },
  { country: "TW", region: "雙北" },
  { country: "", region: "" },
]);
assert(pairs.length === 2, "dedupe geo pairs (legacy 雙北 merges)");
assert(
  pairs.some((p) => p.countryId === GEO_COUNTRY_TW && p.regionId === GEO_REGION_GREATER_TAIPEI),
  "has 大台北地區 pair",
);
assert(pairs.some((p) => p.countryId === GEO_COUNTRY_OTHER && p.regionId === GEO_REGION_OTHER), "has other pair");

const countries = buildCountryOptions(pairs.map((p) => ({ country: p.countryId, region: p.regionId })));
assert(countries.some((c) => c.countryId === GEO_COUNTRY_TW), "country options include TW");
assert(countries.filter((c) => c.countryId === GEO_COUNTRY_OTHER).length === 1, "exactly one 其他 country");
assert(countries[countries.length - 1].countryId === GEO_COUNTRY_OTHER, "其他 at end");

const cities = buildCityOptions(GEO_COUNTRY_TW, [{ country: "TW", region: GEO_REGION_GREATER_TAIPEI }]);
assert(cities.some((c) => c.regionId === GEO_REGION_GREATER_TAIPEI), "city options include 大台北地區");
assert(cities.filter((c) => c.regionId === GEO_REGION_OTHER).length === 1, "exactly one 其他 city");
assert(cities[cities.length - 1].regionId === GEO_REGION_OTHER, "city 其他 at end");

const citiesWithOtherRoute = buildCityOptions(GEO_COUNTRY_OTHER, [{ country: "", region: "" }]);
assert(
  citiesWithOtherRoute.filter((c) => c.regionId === GEO_REGION_OTHER).length === 1,
  "no duplicate 其他 when route already has empty region",
);

const view = getCatalogMapView(GEO_COUNTRY_TW, GEO_REGION_GREATER_TAIPEI);
assert(view?.center[0] === DEFAULT_MAP_VIEW.center[0], "大台北地區 map center lng");
assert(view?.zoom === DEFAULT_MAP_VIEW.zoom, "大台北地區 map zoom");
assert(getCatalogMapView(GEO_COUNTRY_TW, "雙北") != null, "legacy 雙北 resolves catalog view");

assert(getCountryLabelKey(GEO_COUNTRY_TW) === "geo.country.tw", "TW label key");
assert(getCityLabelKey(GEO_REGION_GREATER_TAIPEI) === "geo.city.greaterTaipeiArea", "大台北地區 city label key");
assert(getCityLabelKey("雙北") === "geo.city.greaterTaipeiArea", "legacy 雙北 city label key");
assert(getCountryLabelKey("韓國") === null, "custom country has no label key");

const patch = normalizeGeoMetadataPatch({ country: "台灣", region: " 高雄 ", status: "operating" });
assert(patch.country === GEO_COUNTRY_TW, "metadata patch canonicalizes country");
assert(patch.region === "高雄", "metadata patch trims region");
assert(patch.status === "operating", "metadata patch keeps other fields");

const geo = formatGeoPatch("JP", "東京");
assert(geo.country === "JP" && geo.region === "東京", "formatGeoPatch");

console.log("test-geo-catalog: ok");

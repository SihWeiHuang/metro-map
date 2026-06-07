import { canonicalizeCountryId } from "../src/map/geoCatalog.js";
import {
  ROUTE_LIST_NAV_STORAGE_KEY,
  loadRouteListNav,
  saveRouteListNav,
} from "../src/map/routeListNavPrefs.js";
import { hasCatalogMapView } from "../src/map/geoCatalog.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, v),
  removeItem: (k) => mem.delete(k),
};

saveRouteListNav({ level: "routes", countryId: "TW", regionId: "雙北" });
const loaded = loadRouteListNav();
assert(loaded?.level === "routes", "restore routes level");
assert(loaded?.countryId === "TW", "restore country");
assert(loaded?.regionId === "雙北", "restore region");

saveRouteListNav({ level: "city", countryId: "JP", regionId: "" });
assert(loadRouteListNav()?.level === "city", "restore city level");

saveRouteListNav({ level: "country" });
assert(loadRouteListNav()?.level === "country", "restore country level");

mem.set(
  ROUTE_LIST_NAV_STORAGE_KEY,
  JSON.stringify({ level: "routes", countryId: "", regionId: "x" }),
);
assert(loadRouteListNav() === null, "reject invalid routes nav");

assert(hasCatalogMapView("TW", "雙北") === true, "雙北 has catalog view");
assert(hasCatalogMapView("JP", "東京") === false, "東京 not in catalog yet");

assert(canonicalizeCountryId("台灣") === "TW", "alias still works");

console.log("test-route-list-nav-prefs: ok");

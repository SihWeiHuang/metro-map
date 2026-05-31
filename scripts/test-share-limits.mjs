import {
  MAX_USER_ROUTES,
  countUserRoutesInSharePayload,
  validateSharePayloadObject,
} from "../shared/shareLimits.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const base = {
  format: "metro-multiverse",
  userSubroutesFC: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { route_id: "g1", subroute_id: "r1", route_kind: "user" },
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      },
    ],
  },
  userStationsFC: { type: "FeatureCollection", features: [] },
};

assert(countUserRoutesInSharePayload(base) === 1, "count one user route");
assert(validateSharePayloadObject(base).ok === true, "valid minimal payload");

const over = {
  ...base,
  userSubroutesFC: {
    type: "FeatureCollection",
    features: Array.from({ length: MAX_USER_ROUTES + 1 }, (_, i) => ({
      type: "Feature",
      properties: { route_id: `g${i}`, subroute_id: `r${i}`, route_kind: "user" },
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    })),
  },
};
assert(countUserRoutesInSharePayload(over) === MAX_USER_ROUTES + 1, "count over limit");
assert(validateSharePayloadObject(over).code === "too_many_routes", "reject too many routes");

const defaultOnly = {
  ...base,
  userSubroutesFC: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { route_id: "g1", subroute_id: "r1", route_kind: "default" },
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      },
    ],
  },
};
assert(validateSharePayloadObject(defaultOnly).code === "no_routes", "default routes do not count");

console.log("test-share-limits: ok");

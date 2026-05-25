/**
 * Smoke tests for defaultNames.js — run: npm run test:names
 */
import {
  allocateDefaultRouteLabel,
  normalizeAllUserDefaultNames,
  nextDefaultRouteLabelNumber,
  resolveRouteDisplayNameFromProps,
} from "../src/map/defaultNames.js";

const isUser = () => true;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// Two user lines -> r1, r2
let routes = [
  { properties: { route_id: "g1", subroute_id: "r1", name: "路線r1", route_kind: "user" } },
  { properties: { route_id: "g2", subroute_id: "r2", name: "路線r2", route_kind: "user" } },
];
normalizeAllUserDefaultNames(routes, [], isUser, isUser);
assert(routes[0].properties.user_default_route_label === 1, "line 1 label");
assert(routes[1].properties.user_default_route_label === 2, "line 2 label");

// Import official lines with custom names + internal r3–r6
routes.push(
  { properties: { route_id: "g3", subroute_id: "r3", name: "三鶯線", route_kind: "user" } },
  { properties: { route_id: "g4", subroute_id: "r4", name: "環狀線", route_kind: "user" } },
  { properties: { route_id: "g5", subroute_id: "r5", name: "環狀線", route_kind: "user" } },
  { properties: { route_id: "g6", subroute_id: "r6", name: "小碧潭線", route_kind: "user" } },
);
normalizeAllUserDefaultNames(routes, [], isUser, isUser);

const nextLabel = nextDefaultRouteLabelNumber(routes, isUser);
assert(nextLabel === 3, "next user route label after import");

const allocated = allocateDefaultRouteLabel(routes, isUser);
assert(allocated.user_default_route_label === 3, "allocateDefaultRouteLabel");
assert(allocated.name === "路線r3", "allocateDefaultRouteLabel display name");

// Internal subroute_id r99 must not affect display when label is set
const display = resolveRouteDisplayNameFromProps({
  subroute_id: "r99",
  name: allocated.name,
  user_default_route_label: 3,
});
assert(display === "路線r3", "display uses label not subroute_id");

console.log("test-default-names: all passed");

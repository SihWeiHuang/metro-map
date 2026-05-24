/**
 * Smoke tests for defaultNames.js — run: npm run test:names
 */
import {
  allocateDefaultLineLabel,
  normalizeAllUserDefaultNames,
  nextDefaultLineLabelNumber,
  resolveLineDisplayNameFromProps,
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
  { properties: { group_id: "g1", route_id: "r1", name: "路線r1", route_kind: "user" } },
  { properties: { group_id: "g2", route_id: "r2", name: "路線r2", route_kind: "user" } },
];
normalizeAllUserDefaultNames(routes, [], isUser, isUser);
assert(routes[0].properties.user_default_line_label === 1, "line 1 label");
assert(routes[1].properties.user_default_line_label === 2, "line 2 label");

// Import official lines with custom names + internal r3–r6
routes.push(
  { properties: { group_id: "g3", route_id: "r3", name: "三鶯線", route_kind: "user" } },
  { properties: { group_id: "g4", route_id: "r4", name: "環狀線", route_kind: "user" } },
  { properties: { group_id: "g5", route_id: "r5", name: "環狀線", route_kind: "user" } },
  { properties: { group_id: "g6", route_id: "r6", name: "小碧潭線", route_kind: "user" } },
);
normalizeAllUserDefaultNames(routes, [], isUser, isUser);

const nextLabel = nextDefaultLineLabelNumber(routes, isUser);
assert(nextLabel === 3, "next user line label after import");

const allocated = allocateDefaultLineLabel(routes, isUser);
assert(allocated.user_default_line_label === 3, "allocateDefaultLineLabel");
assert(allocated.name === "路線r3", "allocateDefaultLineLabel display name");

// Internal route_id r99 must not affect display when label is set
const display = resolveLineDisplayNameFromProps({
  route_id: "r99",
  name: allocated.name,
  user_default_line_label: 3,
});
assert(display === "路線r3", "display uses label not route_id");

console.log("test-default-names: all passed");

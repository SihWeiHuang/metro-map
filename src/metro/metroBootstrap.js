/**
 * Application entry bootstrap — load default + persisted metro state once at startup.
 */
import { loadDefaultDataChunks } from "../data/defaultDataLoader.js";
import { bootstrapMetro } from "./routeStoreMutations.js";

let bootstrapped = false;
/** @type {Promise<void> | null} */
let bootstrapPromise = null;

/** Idempotent async startup (called from main.jsx before React render). */
export function ensureMetroBootstrapped() {
  if (bootstrapped) return Promise.resolve();
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await loadDefaultDataChunks();
      bootstrapMetro();
      bootstrapped = true;
    })();
  }
  return bootstrapPromise;
}

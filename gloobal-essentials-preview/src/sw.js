// src/sw.js
//
// The service worker, written by hand because Web Push requires it.
//
// vite-plugin-pwa ran in "generateSW" mode until this file existed: workbox
// wrote the whole worker from the options in vite.config.js, which is fine
// right up to the point where you need a `push` listener, because generateSW
// gives you nowhere to put one. Switching to "injectManifest" makes this
// file the worker and leaves the plugin one job — replacing
// `self.__WB_MANIFEST` below with the list of built files to precache.
//
// The three blocks beneath the imports are not new behaviour. They are the
// same behaviour generateSW used to produce, restated so that nothing about
// caching or updating changes with the strategy:
//
//   precacheAndRoute      ← workbox.globPatterns
//   NetworkFirst document ← workbox.runtimeCaching, same "html-cache" name
//   skipWaiting/claim     ← registerType: "autoUpdate"
//
// Only the last one is easy to get wrong: under generateSW, "autoUpdate"
// makes workbox emit skipWaiting and clientsClaim for you. Under
// injectManifest it does not, and a worker that waits for every tab to
// close would pin the app to an old bundle — exactly the staleness the
// autoUpdate note in vite.config.js exists to avoid.
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { clientsClaim } from "workbox-core";
import { installGloobalPushHandlers } from "./push-sw-core.js";

// The build injects the precache manifest here.
precacheAndRoute(self.__WB_MANIFEST);
// Precaches from previous workbox major versions are dead weight in
// storage and can shadow nothing useful; drop them on activate.
cleanupOutdatedCaches();

// Documents: network first, cache as the fallback. A fresh deploy is
// picked up as soon as the network allows, and the app still opens on a
// train with no signal.
registerRoute(
  ({ request }) => request.destination === "document",
  new NetworkFirst({ cacheName: "html-cache" })
);

self.skipWaiting();
clientsClaim();

// push / notificationclick / pushsubscriptionchange. The logic lives in
// push-sw-core.js so it can be unit-tested without a service worker; this
// call is the only thing binding it to a real one.
installGloobalPushHandlers(self);

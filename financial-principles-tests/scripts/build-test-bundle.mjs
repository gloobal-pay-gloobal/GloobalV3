#!/usr/bin/env node
// Regenerates app_bundle_testonly.mjs and src/data/essentialsBaseline.js
// from the organized source tree (backend/ + frontend/), which is now
// the source of truth — GloobalApp.jsx used to be a single inlined file
// and this script sliced it by its `// src/...` origin comments. Those
// modules are real files again, so the "slice" is now just an ordered
// list of module paths. The tests still exercise exactly what ships,
// never a fork of it.
//
// The module order below reproduces the monolith's evaluation order,
// which matters: these modules were bundled in one shared scope and
// reference each other by bare identifier, with no imports between
// them. Reordering can break hoisting assumptions.
//
// Run: node scripts/build-test-bundle.mjs [path/to/project/root]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || join(__dirname, "..", "..");

// The domain layer: everything the monolith evaluated between
// src/domain/shared/ids.js and the first React/JSX adapter. It is
// JSX-free by construction and re-verified by the guard below.
// frontend/constants/theme.js is in here because it physically sat
// inside that span and is pure data — no React, no JSX.
const DOMAIN_MODULES = [
  "backend/domain/shared/ids.js",
  "backend/domain/ledger/entities/LedgerRecord.js",
  "backend/domain/ledger/LedgerStore.js",
  "backend/domain/ledger/ledgerErrors.js",
  "backend/domain/shared/ChainStore.js",
  "backend/domain/ledger/entities/JournalEntry.js",
  "backend/domain/shared/Money.js",
  "backend/domain/events/DomainEvents.js",
  "backend/domain/ledger/LedgerEngine.js",
  "backend/domain/accounts/entities/LedgerAccount.js",
  "backend/domain/accounts/entities/UserAccount.js",
  "backend/domain/accounts/entities/ReserveAccount.js",
  "backend/domain/accounts/AccountRegistry.js",
  "backend/domain/coin/CoinService.js",
  "backend/domain/liquidity/entities/LiquidityPool.js",
  "backend/domain/liquidity/LiquidityService.js",
  "backend/domain/essentials/EssentialsPoolService.js",
  "backend/domain/essentials/entities/EssentialsWallet.js",
  "backend/domain/ledger/entities/LedgerEntryLine.js",
  "backend/domain/essentials/EssentialsService.js",
  "backend/domain/creatorShare/entities/CreatorShareRecord.js",
  "backend/domain/creatorShare/CreatorShareService.js",
  "backend/domain/paylater/entities/PayLaterRecord.js",
  "backend/domain/paylater/PayLaterService.js",
  "backend/domain/risk/riskCodes.js",
  "backend/domain/risk/RiskEngine.js",
  "backend/domain/settlement/entities/SettlementState.js",
  "backend/domain/settlement/entities/SettlementBatch.js",
  "backend/domain/settlement/SettlementEngine.js",
  "backend/domain/receipts/entities/Receipt.js",
  "backend/utils/idGenerators.js",
  "backend/data/countries.js",
  "backend/domain/shared/financialConstants.js",
  "backend/domain/capabilities/CapabilityState.js",
  "frontend/constants/theme.js",
  // Pure string parsing — no React, no DOM. In here so the static QR pay
  // link's build/parse round trip is covered by the same suite as the rest
  // of the domain.
  "backend/utils/gloobalPayLink.js",
  "backend/utils/currency.js",
  "backend/data/currencies.js",
  "backend/data/essentialsBaseline.js",
  "backend/utils/format.js",
  "backend/domain/receipts/ReceiptService.js",
  "backend/domain/provenance/entities/LocationObservation.js",
  "backend/domain/provenance/LocationResolver.js",
  "backend/domain/provenance/ProvenanceStore.js",
  "backend/domain/provenance/ProvenanceService.js",
  "backend/domain/disputes/disputeCodes.js",
  "backend/domain/disputes/DisputeStore.js",
  "backend/domain/disputes/DisputeService.js",
  "backend/domain/transactions/TransactionEventOutbox.js",
  "backend/domain/transactions/TransactionOrchestrator.js",
  "backend/domain/events/EventBus.js",
  "backend/domain/diagnostics/Logger.js",
  "backend/domain/FinancialCore.js",
];

// Health checks, replay, and the idempotency guard live physically
// later (they were extracted from near the Diagnostics screen) but are
// pure JS — createFinancialCore() references IdempotencyGuard, so they
// must be included even though they are declared far from the rest of
// the domain layer in file order (fine: none of this runs until a test
// actually calls createFinancialCore(), by which point the whole
// module has evaluated top to bottom regardless of physical ordering).
const DIAGNOSTICS_MODULES = [
  "backend/domain/diagnostics/HealthMonitor.js",
  "backend/domain/diagnostics/DiagnosticsService.js",
  "backend/domain/replay/LedgerReplay.js",
  "backend/domain/resilience/IdempotencyGuard.js",
];

function readModules(paths) {
  return paths.map((p) => readFileSync(join(ROOT, p), "utf8").replace(/\n+$/, "")).join("\n\n");
}

const combined = [readModules(DOMAIN_MODULES), readModules(DIAGNOSTICS_MODULES)].join("\n\n");

const jsxLike = combined.split("\n").find((l) => {
  const codePart = l.split("//")[0];
  return /<[A-Za-z][A-Za-z0-9]*[ />]/.test(codePart);
});
if (jsxLike) {
  throw new Error(`Extracted "pure domain" slice contains what looks like JSX (${jsxLike}) — the module list needs updating, this bundle must stay React-free.`);
}

const importLike = combined.split("\n").find((l) => /^\s*(import|export)\s/.test(l));
if (importLike) {
  throw new Error(`Domain module contains a top-level import/export (${importLike}) — the bundle concatenates modules into one shared scope, so they must stay import-free.`);
}

const EXPORTS = [
  "createFinancialCore", "AccountRegistry", "LedgerEngine", "LedgerStore", "ChainStore", "EventBus", "DomainEvent",
  "Money", "DebitEntry", "CreditEntry", "ACCOUNT_TYPE", "IdempotencyGuard",
  "runHealthChecks", "replayIntoFreshStore", "checkMonetaryConservation", "checkNoUnbackedIncomeRecognition",
  "DISPUTE_STATUS", "DISPUTE_ERROR",
  "LOCATION_STATUS", "LOCATION_STALE_AFTER_MS_DEFAULT", "LocationObservation", "unknownObservation", "asObservation", "withFreshness",
  "resolveLocationLabel", "captureBrowserGeo", "LOCATION_MOCK_CITIES",
  "COMPLAINT_WINDOW_MINUTES_DEFAULT", "DISPUTE_RECEIVER_RESPONSE_HOURS_DEFAULT",
  "CAPABILITY_KEY", "deriveCapabilityStates", "deriveProductServices", "SERVICE_STATUS",
  "EssentialsService", "EssentialsGrant", "EssentialsPoolService", "TransactionOrchestrator", "ProvenanceService", "DisputeService",
  "CoinService", "COIN_CURRENCY", "LiquidityService", "RiskEngine", "SettlementEngine", "PayLaterService", "CreatorShareService",
  "DIAL_SYMBOLS", "TXN_ID_LENGTH", "genTxnId", "genSuggestedId",
  "GLOOBAL_PAY_ID_LENGTH", "isGloobalPayId", "buildGloobalPayUrl", "parseGloobalPayPayload", "readGloobalPayIdFromPath"
];

const bundle = `// AUTO-GENERATED by scripts/build-test-bundle.mjs — do not hand-edit.
// Source of truth: backend/ (plus frontend/constants/theme.js).
// Regenerate after any domain-layer change.
${combined}

export {
${EXPORTS.map((n) => "  " + n).join(",\n")}
};
`;
writeFileSync(join(__dirname, "..", "app_bundle_testonly.mjs"), bundle);

// src/data/essentialsBaseline.js — same technique, narrower slice.
const BASELINE_MODULES = [
  "backend/utils/idGenerators.js",
  "backend/data/countries.js",
  "backend/utils/currency.js",
  "backend/data/currencies.js",
  "backend/data/essentialsBaseline.js",
];
const baselineCombined = readModules(BASELINE_MODULES);
const baselineExports = [
  "ESSENTIALS_BASELINE_USD_BY_ISO", "ESSENTIALS_BASELINE_DEFAULT_USD", "ESSENTIALS_BASELINE_REQUIRED_KEYS",
  "isValidEssentialsBaselineEntry", "EssentialsBaselineRepository", "computeEssentialsBaseline",
  "COUNTRY_CURRENCY", "RATES", "convert"
];
mkdirSync(join(__dirname, "..", "src", "data"), { recursive: true });
writeFileSync(
  join(__dirname, "..", "src", "data", "essentialsBaseline.js"),
  `// AUTO-GENERATED by scripts/build-test-bundle.mjs — do not hand-edit.\n${baselineCombined}\n\nexport {\n${baselineExports.map((n) => "  " + n).join(",\n")}\n};\n`
);

console.log("Wrote app_bundle_testonly.mjs and src/data/essentialsBaseline.js");

#!/usr/bin/env node
/**
 * build_app.mjs — Concatenates organized source files back into GloobalApp.jsx
 * 
 * The individual files under backend/ and frontend/ are the source of truth.
 * This script combines them (in the correct dependency order) into a single
 * file that Vite can consume, replicating the original bundled monolith's
 * shared-scope evaluation.
 * 
 * Import statements are collected from all modules, deduplicated, and placed
 * at the top. Export statements are stripped and a single default export is
 * appended at the bottom.
 * 
 * Run: node build_app.mjs [rootDir]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] || ".";

const BACKEND_MODULES = [
  "domain/shared/ids.js",
  "domain/ledger/entities/LedgerRecord.js",
  "domain/ledger/LedgerStore.js",
  "domain/ledger/ledgerErrors.js",
  "domain/shared/ChainStore.js",
  "domain/ledger/entities/JournalEntry.js",
  "domain/shared/Money.js",
  "domain/events/DomainEvents.js",
  "domain/ledger/LedgerEngine.js",
  "domain/accounts/entities/LedgerAccount.js",
  "domain/accounts/entities/UserAccount.js",
  "domain/accounts/entities/ReserveAccount.js",
  "domain/accounts/AccountRegistry.js",
  // Gloobal Coin's ledger side. After the accounts it posts against, before
  // FinancialCore, which constructs it.
  "domain/coin/CoinService.js",
  "domain/liquidity/entities/LiquidityPool.js",
  "domain/liquidity/LiquidityService.js",
  "domain/essentials/EssentialsPoolService.js",
  "domain/essentials/entities/EssentialsWallet.js",
  "domain/ledger/entities/LedgerEntryLine.js",
  "domain/essentials/EssentialsService.js",
  "domain/creatorShare/entities/CreatorShareRecord.js",
  "domain/creatorShare/CreatorShareService.js",
  "domain/paylater/entities/PayLaterRecord.js",
  "domain/paylater/PayLaterService.js",
  "domain/risk/riskCodes.js",
  "domain/risk/RiskEngine.js",
  "domain/settlement/entities/SettlementState.js",
  "domain/settlement/entities/SettlementBatch.js",
  "domain/settlement/SettlementEngine.js",
  "domain/receipts/entities/Receipt.js",
  "utils/idGenerators.js",
  "data/countries.js",
  "domain/shared/financialConstants.js",
  "utils/currency.js",
  "data/currencies.js",
  "data/essentialsBaseline.js",
  "utils/format.js",
  "domain/receipts/ReceiptService.js",
  "domain/provenance/entities/LocationObservation.js",
  "domain/provenance/LocationResolver.js",
  "domain/provenance/ProvenanceStore.js",
  "domain/provenance/ProvenanceService.js",
  "domain/disputes/disputeCodes.js",
  "domain/disputes/DisputeStore.js",
  "domain/disputes/DisputeService.js",
  "domain/transactions/TransactionEventOutbox.js",
  "domain/transactions/TransactionOrchestrator.js",
  "domain/events/EventBus.js",
  "domain/diagnostics/Logger.js",
  "domain/FinancialCore.js",
  "domain/capabilities/CapabilityState.js",
  "utils/color.js",
  "data/mockData.js",
  "data/coverage.js",
  "data/ghScoreCategories.js",
  "data/banks.js",
  "utils/particles.js",
  // The static Gloobal QR pay link: build, strict parse, deep-link read.
  "utils/gloobalPayLink.js",
  "utils/creatorShare.js",
  "utils/date.js",
  "utils/demoGenerators.js",
  "utils/requestId.js",
  "services/share/clipboard.js",
  "services/share/webShare.js",
  "services/storage/coverageStorage.js",
  // Real backend (Express + MongoDB Atlas on Render). httpClient defines
  // the transport the rest build on, so it goes first.
  "services/api/httpClient.js",
  "services/api/rateLimiter.js",
  "services/api/sessionStore.js",
  "services/api/gloobalApi.js",
  "core/transaction/transactionSnapshot.js",
  "domain/diagnostics/HealthMonitor.js",
  "domain/diagnostics/DiagnosticsService.js",
  "domain/replay/LedgerReplay.js",
  "domain/resilience/IdempotencyGuard.js",
  "domain/resilience/OfflineQueue.js",
  "domain/resilience/FaultInjector.js",
  "domain/resilience/RetryPolicy.js",
  "domain/simulation/FinancialSimulator.js",
];

const FRONTEND_MODULES = [
  "constants/theme.js",
  // The biometric gate. Every guarded action calls into it, from the
  // registration screens through to Send Money, so it is defined before
  // any of them. It builds on the backend's session store and API client
  // (both already emitted above, from BACKEND_MODULES).
  "hooks/useBiometric.js",
  // The single source of truth for the current Gloobal ID. Every screen
  // that displays one reads it through this, so it is defined ahead of all
  // of them.
  "hooks/useCurrentSymbolId.js",
  // Early: it wraps the full-screen views, so it must be defined before
  // anything that renders one.
  "components/common/ScreenErrorBoundary.jsx",
  "adapters/ledger/LedgerProvider.jsx",
  "components/buttons/index.jsx",
  // The shared back / history navigation controls. Emitted right after the
  // other buttons and before every screen that renders one.
  "components/buttons/navButtons.jsx",
  "components/cards/flags.jsx",
  "components/common/backgrounds.jsx",
  "components/common/brand.jsx",
  "components/common/coloredId.jsx",
  "components/common/icons.jsx",
  // The pull-to-refresh wrapper. Needs the theme (emitted first) and is
  // rendered by the Dashboard, so it sits ahead of every screen.
  "components/common/PullToRefresh.jsx",
  "components/dialogs/registerLogin.jsx",
  // The dial's synthesised mechanical feedback. Emitted before the dial that
  // calls it — the functions hoist, but DIAL_SOUND_VOICES and DIAL_DETENT_DEG
  // beside them are `var` initialisers that do not.
  "components/common/dialSound.js",
  "components/inputs/dialPads.jsx",
  "components/payments/PayOptionsSheet.jsx",
  "components/payments/PayPinModal.jsx",
  "components/inputs/codeInputs.jsx",
  "adapters/ledger/useLedgerProjections.js",
  "adapters/ledger/useTransactionActions.js",
  "adapters/ledger/useCoinActions.js",
  "adapters/ledger/useProvenanceAndDisputes.js",
  "hooks/useBackClose.js",
  // Location as a precondition of paying. Needs the provenance layer's
  // LocationObservation/captureBrowserGeo (already emitted from
  // BACKEND_MODULES) and is consulted by App.jsx's payment handlers.
  "hooks/usePaymentLocation.js",
  // Payment notifications: the ask (after the first payment, never before),
  // the per-transaction dedupe, and the sending. Needs G_LOGO_DATA_URI from
  // data/mockData.js, already emitted above.
  "hooks/usePaymentNotifications.js",
  // Web Push: the same notifications, but to a device whose app is closed.
  // Directly after usePaymentNotifications because it reuses that file's
  // permission state (the once-only ask, `Notification.permission`) rather
  // than prompting a second time, and because both are called from the
  // same payment handlers in App.jsx.
  "hooks/useWebPush.js",
  "hooks/useAmbientFlags.js",
  "components/cards/misc.jsx",
  "components/charts/ghRing.jsx",
  "components/common/flipIcons.jsx",
  // The round profile photo with its Gloobal-logo fallback, and the signed-in
  // cache of counterparties' photos read from the server. Ahead of the scan
  // card (App.jsx), the receipt and the receipt image, which all draw one.
  "components/common/profileAvatar.jsx",
  // The static receive QR card. Needs gloobalPayLink.js (backend) and
  // G_LOGO_DATA_URI; ahead of Dashboard, which will show it.
  // The animal pictures for the receive QR, and the layout rules that keep
  // each one scannable. Plain JS; ahead of the card, which draws them.
  "components/common/gloobalAnimalQr.js",
  "components/common/gloobalReceiveQrCard.jsx",
  // The four action tiles' own motion: send flies off, receive drops in,
  // scan sweeps, bank settles. Sits outside the flip rather than replacing
  // it, so the two compose.
  "components/common/actionTileMotion.jsx",
  "components/common/misc.jsx",
  // What a receipt says about currency — the payment's conversion and the
  // Creator Share's — read one way by the screen, the picture and the PDF.
  // Ahead of all three.
  "features/receipts/receiptCurrency.js",
  // The audit report: one transaction, as a PDF. Ahead of ReceiptModal,
  // which is the only thing that opens one.
  "features/receipts/auditReport.js",
  // A Gloobal Coin buy or sell, as a receipt. Ahead of ReceiptModal, which
  // renders it, and ahead of the Coin screen, which opens it.
  "features/receipts/coinReceipt.js",
  // The shareable receipt image (PNG), branding drawn inside it. Ahead of
  // ReceiptModal, which shares it.
  "features/receipts/receiptImage.js",
  "components/dialogs/ReceiptModal.jsx",
  // The screen between "verified" and the receipt. Renders the
  // transactionStatus SendMoney was already tracking and nothing drew.
  "components/dialogs/PaymentProcessing.jsx",
  // After a payment: one question, then scratch to see the Creator Share.
  // Ahead of SendMoney, which shows it before the receipt.
  "components/dialogs/PaymentUnlock.jsx",
  // The two explain-this-screen sheets opened from the registration
  // screens' top-right corner. Needs hooks/useBackClose.js (above) and is
  // rendered from App.jsx (below).
  "components/dialogs/helpSheets.jsx",
  // The blocking screen shown when a payment stops for want of a location.
  "components/dialogs/LocationRequiredModal.jsx",
  // The in-app notification list, read from the server. Rendered from the
  // Dashboard (below).
  "components/dialogs/NotificationsSheet.jsx",
  "features/assets/AssetsScreen.jsx",
  "features/essentials/EssentialsScreen.jsx",
  "features/history/TransactionRow.jsx",
  "features/history/historyUtils.js",
  // The one newest-first rule every transaction list sorts by. Function
  // declarations only, so its position is not load-order sensitive.
  "features/history/transactionOrder.js",
  "features/history/TransactionHistoryScreen.jsx",
  "features/paylater/PayLaterLedger.jsx",
  "features/paylater/PayLaterScreen.jsx",
  "screens/Banks/AddBankScreen.jsx",
  // The Gloobal Bank / Gloobal Coin / About Us screens, and the pieces
  // the first two share. All three used to be conditional blocks inside
  // DashboardScreen's return; they are still opened from there, so they
  // are emitted ahead of it.
  "components/cards/GloobalTaglineCard.jsx",
  "screens/Banks/GloobalBankScreen.jsx",
  "screens/Coin/GloobalCoinScreen.jsx",
  "screens/Coin/SendCoinScreen.jsx",
  "screens/Coin/CoinHoldersScreen.jsx",
  "screens/Coin/CountryHoldersScreen.jsx",
  "screens/About/AboutUsScreen.jsx",
  "screens/Dashboard/Dashboard.jsx",
  "screens/SendMoney/SendMoney.jsx",
  "screens/Coverage/GloobalCoverageScreen.jsx",
  "adapters/diagnostics/useDiagnostics.js",
  "screens/DevTools/DiagnosticsScreen.jsx",
  "screens/DevTools/DisputeCasesSection.jsx",
  "components/common/qrScanner.jsx",
  "components/common/appMap.jsx",
  "App.jsx",
  "components/common/launchSplash.jsx",
  "__artifactEntry.jsx",
];

/**
 * Processes a module file's content:
 * - Extracts import lines (single and multi-line) into the imports set
 * - Strips import lines and export blocks from the body
 * - Returns the cleaned body
 */
function processModule(content, allImportLines) {
  const lines = content.split("\n");
  const bodyLines = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Single-line import: import ... from "...";
    if (/^import\s+/.test(line) && line.includes("from") && line.trimEnd().endsWith(";")) {
      allImportLines.add(line);
      i++;
      continue;
    }
    
    // Multi-line import: import { ... starts on this line, } from "..." on a later line
    if (/^import\s+/.test(line) && !line.trimEnd().endsWith(";")) {
      let importBlock = line;
      i++;
      while (i < lines.length) {
        importBlock += "\n" + lines[i];
        if (lines[i].startsWith("} from ")) {
          i++;
          break;
        }
        i++;
      }
      allImportLines.add(importBlock);
      continue;
    }
    
    // Skip export blocks at end of module
    if (/^export\s*\{/.test(line)) {
      // Skip until closing };
      while (i < lines.length && !lines[i].includes("};")) {
        i++;
      }
      i++; // skip the closing line too
      continue;
    }
    
    bodyLines.push(line);
    i++;
  }
  
  return bodyLines.join("\n");
}

// ── Process all modules ──
const allImportLines = new Set();
let combinedBody = "";

// Backend modules
for (const mod of BACKEND_MODULES) {
  const filePath = join(ROOT, "backend", mod);
  try {
    const content = readFileSync(filePath, "utf8");
    const body = processModule(content, allImportLines);
    combinedBody += body + "\n\n";
  } catch (e) {
    console.error("Missing backend module:", filePath, e.message);
    process.exit(1);
  }
}

// Frontend modules
for (const mod of FRONTEND_MODULES) {
  const filePath = join(ROOT, "frontend", mod);
  try {
    const content = readFileSync(filePath, "utf8");
    const body = processModule(content, allImportLines);
    combinedBody += body + "\n\n";
  } catch (e) {
    console.error("Missing frontend module:", filePath, e.message);
    process.exit(1);
  }
}

// ── Assemble final output ──
let output = "// Auto-generated from organized sources by build_app.mjs\n";
output += "// Source of truth: backend/ and frontend/ directories\n\n";

// Add consolidated imports
for (const imp of allImportLines) {
  output += imp + "\n";
}
output += "\n";

// Add all module bodies
output += combinedBody;

// Add the final export
output += `
export {
  GloobalArtifactRoot as default
};
`;

writeFileSync(join(ROOT, "gloobal-essentials-preview", "src", "GloobalApp.jsx"), output);
console.log("Built gloobal-essentials-preview/src/GloobalApp.jsx from organized sources");
console.log(`  Consolidated ${allImportLines.size} unique import statements`);

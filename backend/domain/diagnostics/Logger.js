// src/domain/diagnostics/Logger.js
var LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
var EVENT_LEVEL = {
  [DomainEvent.LEDGER_ENTRY_POSTED]: "info",
  [DomainEvent.LEDGER_ENTRY_REJECTED]: "error",
  [DomainEvent.RISK_EVALUATED]: "debug",
  [DomainEvent.SETTLEMENT_POSTED]: "info",
  [DomainEvent.PAYLATER_DRAW_RECORDED]: "info",
  [DomainEvent.ESSENTIALS_GRANT_ADDED]: "info",
  [DomainEvent.ESSENTIALS_POOL_APPLIED]: "info",
  [DomainEvent.REQUEST_RETRIED]: "warn",
  [DomainEvent.REQUEST_DEDUPED]: "warn",
  [DomainEvent.REQUEST_QUEUED_OFFLINE]: "warn",
  [DomainEvent.OFFLINE_QUEUE_FLUSHED]: "info",
  [DomainEvent.FAULT_INJECTED]: "error",
  [DomainEvent.SIMULATION_STEP]: "debug",
  [DomainEvent.SIMULATION_COMPLETE]: "info",
  [DomainEvent.PROVENANCE_COMPLETED]: "info",
  [DomainEvent.LOCATION_OBSERVATION_SUBMITTED]: "debug",
  [DomainEvent.TRANSACTION_FAILED]: "error",
  [DomainEvent.TRANSACTION_LOCKED]: "warn",
  [DomainEvent.DISPUTE_OPENED]: "warn",
  [DomainEvent.DISPUTE_ACCEPTED]: "info",
  [DomainEvent.DISPUTE_DECLINED]: "warn",
  [DomainEvent.DISPUTE_EXPIRED]: "warn",
  [DomainEvent.DISPUTE_ESCALATED]: "warn",
  [DomainEvent.DISPUTE_RESOLVED]: "info",
  [DomainEvent.CORE_INITIALIZED]: "info"
};
function summarize(eventName, payload) {
  switch (eventName) {
    case DomainEvent.LEDGER_ENTRY_POSTED:
      return `posted #${payload.sequence} "${payload.memo}" (${payload.lines.length} lines)`;
    case DomainEvent.LEDGER_ENTRY_REJECTED:
      return `rejected [${payload.code}] ${payload.message}`;
    case DomainEvent.RISK_EVALUATED:
      return payload.ok ? `risk ok for \u20B9${payload.amount}` : `risk rejected [${payload.code}] ${payload.reason}`;
    case DomainEvent.SETTLEMENT_POSTED:
      return `settled ${payload.kind} \u20B9${payload.amount}`;
    case DomainEvent.PROVENANCE_COMPLETED:
      return `txn ${payload.txnId} completed \u2014 complaint window until ${formatClockTime(new Date(payload.complaintWindowExpiresAt))}`;
    case DomainEvent.LOCATION_OBSERVATION_SUBMITTED:
      return `txn ${payload.txnId} \u2014 ${payload.role} location: ${payload.status}`;
    case DomainEvent.TRANSACTION_FAILED:
      return `txn ${payload.txnId} rolled back [${payload.code}] ${payload.reason}`;
    case DomainEvent.TRANSACTION_LOCKED:
      return `txn ${payload.txnId} rejected \u2014 another transaction is already in progress`;
    case DomainEvent.DISPUTE_OPENED:
      return `case ${payload.caseId} opened for ${payload.txnId} by ${payload.raisedBy} \u2014 receiver has until ${new Date(payload.receiverResponseDeadline).toLocaleString()}`;
    case DomainEvent.DISPUTE_ACCEPTED:
      return `case ${payload.caseId} accepted \u2014 conversation open`;
    case DomainEvent.DISPUTE_DECLINED:
      return `case ${payload.caseId} declined by receiver`;
    case DomainEvent.DISPUTE_EXPIRED:
      return `case ${payload.caseId} expired \u2014 no receiver response`;
    case DomainEvent.DISPUTE_ESCALATED:
      return `case ${payload.caseId} escalated (${payload.triggeredBy})`;
    case DomainEvent.DISPUTE_RESOLVED:
      return `case ${payload.caseId} resolved`;
    case DomainEvent.CORE_INITIALIZED:
      return `core initialized for ${payload.userId} (${payload.currency}, opening \u20B9${payload.openingBankBalance})`;
    default:
      return eventName;
  }
}
var Logger = class {
  #bus;
  #level;
  #scope;
  #sink;
  #unsubscribe;
  #ringBuffer = [];
  #ringLimit = 200;
  constructor(bus, { level = "info", scope = "core", sink = defaultSink } = {}) {
    this.#bus = bus;
    this.#level = LEVELS[level] ?? LEVELS.info;
    this.#scope = scope;
    this.#sink = sink;
    this.#unsubscribe = bus.onAny((eventName, payload) => this.#handle(eventName, payload));
  }
  #handle(eventName, payload) {
    const level = EVENT_LEVEL[eventName] || "debug";
    const entry = { at: /* @__PURE__ */ new Date(), scope: this.#scope, level, eventName, message: summarize(eventName, payload), payload, isError: ERROR_EVENTS.has(eventName) };
    this.#ringBuffer.push(entry);
    if (this.#ringBuffer.length > this.#ringLimit) this.#ringBuffer.shift();
    if (LEVELS[level] <= this.#level) this.#sink(entry);
  }
  setLevel(level) {
    this.#level = LEVELS[level] ?? this.#level;
  }
  recent(limit = 50) {
    return this.#ringBuffer.slice(-limit);
  }
  errors(limit = 50) {
    return this.#ringBuffer.filter((e) => e.isError).slice(-limit);
  }
  dispose() {
    this.#unsubscribe?.();
  }
};
function defaultSink(entry) {
  const line = `[${entry.scope}] ${entry.eventName} \u2014 ${entry.message}`;
  const method = entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "log";
  if (typeof console !== "undefined" && typeof console[method] === "function") console[method](line);
}
function createLogger(bus, opts) {
  return new Logger(bus, opts);
}


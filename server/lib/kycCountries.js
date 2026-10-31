// lib/kycCountries.js — how each country proves who somebody is.
//
// The bank-opening flow used to know two countries: India (Aadhaar + PAN)
// and "everywhere else" (passport). That put an Aadhaar box in front of
// somebody in Dubai the moment the phone's dial country said +91, and let
// anybody POST an Aadhaar to the server whatever country their account was
// in. This table fixes both: the server decides which ways to prove identity
// apply, from the ACCOUNT's country (User.countryIso), and refuses any other.
//
// Each country lists methods. A method is:
//   status 'live'         usable now. The check is the prototype one: the
//                         number's shape and, where the country has one, its
//                         check digit. Until a provider is connected, that is
//                         ALL it checks — kycMode: 'prototype' on the account
//                         says so.
//   status 'coming_soon'  shown greyed, so people can see what is planned.
//   provider              the local service the live check will call once
//                         connected. Named so the screen can say it, and so
//                         this file is the list of integrations to build.
//   verify 'otp'          a code to a registered mobile follows (Aadhaar).
//          'instant'      no code; the check is the number itself.
//
// Fields carry their own validator. Nothing here is stored as typed: bank.js
// keeps the last four characters and a keyed hash of each.

// ── check digits ───────────────────────────────────────────────────────────
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
function verhoeffValid(digits) {
  let c = 0;
  const arr = String(digits).split('').reverse().map(Number);
  for (let i = 0; i < arr.length; i++) c = V_D[c][V_P[i % 8][arr[i]]];
  return c === 0;
}
function cpfValid(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

// ── field validators: return the clean value, or null ─────────────────────
const digitsOnly = (v) => String(v || '').replace(/[\s-]/g, '');
const upperAlnum = (v) => String(v || '').replace(/[\s-]/g, '').toUpperCase();
const V = {
  aadhaar: (v) => { const d = digitsOnly(v); return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d) ? d : null; },
  pan: (v) => { const p = upperAlnum(v); return /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(p) ? p : null; },
  passport: (v) => { const p = upperAlnum(v); return /^[A-Z0-9]{6,9}$/.test(p) ? p : null; },
  emiratesId: (v) => { const d = digitsOnly(v); return /^784\d{12}$/.test(d) ? d : null; },
  nric: (v) => { const p = upperAlnum(v); return /^[STFGM]\d{7}[A-Z]$/.test(p) ? p : null; },
  ssn: (v) => { const d = digitsOnly(v); return /^(?!000|666|9\d\d)\d{3}(?!00)\d{2}(?!0000)\d{4}$/.test(d) ? d : null; },
  nin: (v) => { const d = digitsOnly(v); return /^\d{11}$/.test(d) ? d : null; },
  bvn: (v) => { const d = digitsOnly(v); return /^2\d{10}$/.test(d) ? d : null; },
  cnic: (v) => { const d = digitsOnly(v); return /^[1-7]\d{12}$/.test(d) ? d : null; },
  bdNid: (v) => { const d = digitsOnly(v); return /^(\d{10}|\d{13}|\d{17})$/.test(d) ? d : null; },
  cpf: (v) => { const d = digitsOnly(v).replace(/\./g, ''); return cpfValid(d) ? d : null; },
  philsys: (v) => { const d = digitsOnly(v); return /^\d{16}$/.test(d) ? d : null; },
  nik: (v) => { const d = digitsOnly(v); return /^\d{16}$/.test(d) ? d : null; },
  keId: (v) => { const d = digitsOnly(v); return /^\d{6,9}$/.test(d) ? d : null; },
  futureDate: (v) => {
    const s = String(v || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T23:59:59Z`);
    return Number.isNaN(d.getTime()) || d < new Date() ? null : s;
  },
};

// ── field descriptors (what the phone draws) ──────────────────────────────
const F = {
  aadhaar: { key: 'aadhaar', label: 'Aadhaar number', placeholder: '1234 5678 9012', inputMode: 'numeric', group: 4, maxDigits: 12, secure: true, store: 'last4', error: 'That Aadhaar number is not valid. Check all 12 digits.' },
  pan: { key: 'pan', label: 'PAN', placeholder: 'ABCPK1234L', upper: true, maxLength: 10, store: 'masked', error: 'That PAN is not valid. It looks like ABCPK1234L.' },
  passport: { key: 'passportNumber', label: 'Passport number', placeholder: 'Z1234567', upper: true, maxLength: 9, store: 'last4', error: 'That passport number is not valid.' },
  passportExpiry: { key: 'passportExpiry', label: 'Expiry date', type: 'date', store: 'plain', error: 'Enter an expiry date that has not passed.' },
  emiratesId: { key: 'emiratesId', label: 'Emirates ID number', placeholder: '784-1990-1234567-1', inputMode: 'numeric', maxDigits: 15, store: 'last4', error: 'An Emirates ID has 15 digits and starts with 784.' },
  emiratesIdExpiry: { key: 'emiratesIdExpiry', label: 'Expiry date', type: 'date', store: 'plain', error: 'Enter an expiry date that has not passed.' },
  nric: { key: 'nric', label: 'NRIC or FIN', placeholder: 'S1234567D', upper: true, maxLength: 9, store: 'last4', error: 'That NRIC or FIN is not valid. It looks like S1234567D.' },
  ssn: { key: 'ssn', label: 'Social Security number', placeholder: '123-45-6789', inputMode: 'numeric', maxDigits: 9, secure: true, store: 'last4', error: 'That Social Security number is not valid.' },
  nin: { key: 'nin', label: 'NIN', placeholder: '12345678901', inputMode: 'numeric', maxDigits: 11, store: 'last4', error: 'A NIN has 11 digits.' },
  bvn: { key: 'bvn', label: 'BVN', placeholder: '22123456789', inputMode: 'numeric', maxDigits: 11, store: 'last4', error: 'A BVN has 11 digits and starts with 2.' },
  cnic: { key: 'cnic', label: 'CNIC number', placeholder: '35202-1234567-1', inputMode: 'numeric', maxDigits: 13, store: 'last4', error: 'A CNIC has 13 digits.' },
  bdNid: { key: 'nid', label: 'NID number', placeholder: '10, 13 or 17 digits', inputMode: 'numeric', maxDigits: 17, store: 'last4', error: 'An NID has 10, 13 or 17 digits.' },
  cpf: { key: 'cpf', label: 'CPF', placeholder: '123.456.789-09', inputMode: 'numeric', maxDigits: 11, store: 'last4', error: 'That CPF is not valid. Check the last two digits.' },
  philsys: { key: 'pcn', label: 'PhilSys card number (PCN)', placeholder: '1234 5678 9012 3456', inputMode: 'numeric', group: 4, maxDigits: 16, store: 'last4', error: 'A PhilSys card number has 16 digits.' },
  nik: { key: 'nik', label: 'NIK', placeholder: '16 digits on your KTP', inputMode: 'numeric', maxDigits: 16, store: 'last4', error: 'A NIK has 16 digits.' },
  keId: { key: 'nationalId', label: 'National ID number', placeholder: '12345678', inputMode: 'numeric', maxDigits: 9, store: 'last4', error: 'That ID number is not valid.' },
};
const VALIDATOR_FOR = {
  aadhaar: V.aadhaar, pan: V.pan, passportNumber: V.passport, passportExpiry: V.futureDate,
  emiratesId: V.emiratesId, emiratesIdExpiry: V.futureDate, nric: V.nric, ssn: V.ssn, nin: V.nin, bvn: V.bvn,
  cnic: V.cnic, nid: V.bdNid, cpf: V.cpf, pcn: V.philsys, nik: V.nik, nationalId: V.keId,
};

// ── methods ───────────────────────────────────────────────────────────────
const PASSPORT = {
  key: 'passport', label: 'Passport', sub: 'Number and expiry date', status: 'live', verify: 'instant',
  fields: [F.passport, F.passportExpiry], keepReady: ['Passport'],
  provider: 'an ID-document check partner that reads the passport chip and photo page',
};
const soon = (key, label, sub, provider) => ({ key, label, sub, status: 'coming_soon', provider, fields: [] });

const COUNTRIES = {
  IN: {
    postcodeLabel: 'PIN code', incomeCurrency: '₹', incomeUnit: 'lakh',
    methods: [
      { key: 'aadhaar_pan', label: 'Aadhaar and PAN', sub: 'A code goes to your Aadhaar mobile', status: 'live', verify: 'otp',
        otpTo: 'the mobile linked to your Aadhaar', fields: [F.aadhaar, F.pan], keepReady: ['Aadhaar', 'PAN'],
        provider: 'UIDAI Aadhaar e-KYC (through a licensed KUA) and PAN verification (Protean / NSDL)' },
      soon('digilocker', 'DigiLocker', 'Aadhaar and PAN in one go', 'DigiLocker (MeitY)'),
      soon('ckyc', 'Central KYC', 'If you have done KYC at another bank', 'CKYC Registry (CERSAI)'),
    ],
  },
  AE: {
    postcodeLabel: 'Postcode (optional area code)',
    methods: [
      { key: 'emirates_id', label: 'Emirates ID', sub: 'Number and expiry date', status: 'live', verify: 'instant',
        fields: [F.emiratesId, F.emiratesIdExpiry], keepReady: ['Emirates ID'], provider: 'ICP Emirates ID verification' },
      soon('uae_pass', 'UAE PASS', 'Sign in with the national digital identity', 'UAE PASS (TDRA)'),
      PASSPORT,
    ],
  },
  SG: {
    methods: [
      { key: 'nric', label: 'NRIC or FIN', sub: 'The number on your IC or pass', status: 'live', verify: 'instant',
        fields: [F.nric], keepReady: ['NRIC or FIN'], provider: 'Singpass Myinfo (GovTech) — will replace typing the number' },
      soon('singpass', 'Singpass Myinfo', 'Fill everything from Singpass', 'Singpass Myinfo (GovTech)'),
      PASSPORT,
    ],
  },
  US: {
    postcodeLabel: 'ZIP code',
    methods: [
      { key: 'ssn', label: 'Social Security number', sub: 'Your SSN', status: 'live', verify: 'instant',
        fields: [F.ssn], keepReady: ['Social Security number'], provider: 'SSA Consent Based SSN Verification (CBSV)' },
      PASSPORT,
    ],
  },
  GB: {
    methods: [
      PASSPORT,
      soon('uk_digital_id', 'Digital identity app', 'A certified UK digital ID', 'A provider certified under the UK digital identity trust framework'),
    ],
  },
  NG: {
    methods: [
      { key: 'nin_bvn', label: 'NIN and BVN', sub: 'Your national ID and bank verification numbers', status: 'live', verify: 'instant',
        fields: [F.nin, F.bvn], keepReady: ['NIN', 'BVN'], provider: 'NIMC NIN verification and NIBSS BVN validation' },
      PASSPORT,
    ],
  },
  PK: {
    methods: [
      { key: 'cnic', label: 'CNIC', sub: 'Your national identity card', status: 'live', verify: 'instant',
        fields: [F.cnic], keepReady: ['CNIC'], provider: 'NADRA Verisys' },
      PASSPORT,
    ],
  },
  BD: {
    methods: [
      { key: 'bd_nid', label: 'National ID (NID)', sub: 'Your NID card number', status: 'live', verify: 'instant',
        fields: [F.bdNid], keepReady: ['NID card'], provider: 'Bangladesh Election Commission NID verification' },
      PASSPORT,
    ],
  },
  BR: {
    postcodeLabel: 'CEP',
    methods: [
      { key: 'cpf', label: 'CPF', sub: 'Your taxpayer number', status: 'live', verify: 'instant',
        fields: [F.cpf], keepReady: ['CPF'], provider: 'Receita Federal CPF check' },
      soon('govbr', 'gov.br', 'Sign in with your gov.br account', 'gov.br login'),
      PASSPORT,
    ],
  },
  PH: {
    methods: [
      { key: 'philsys', label: 'PhilSys national ID', sub: 'Your PhilID card number', status: 'live', verify: 'instant',
        fields: [F.philsys], keepReady: ['PhilID'], provider: 'PhilSys (PSA) ID check' },
      PASSPORT,
    ],
  },
  ID: {
    postcodeLabel: 'Kode pos',
    methods: [
      { key: 'nik', label: 'NIK (KTP)', sub: 'Your e-KTP number', status: 'live', verify: 'instant',
        fields: [F.nik], keepReady: ['e-KTP'], provider: 'Dukcapil population data check' },
      PASSPORT,
    ],
  },
  KE: {
    methods: [
      { key: 'ke_id', label: 'National ID', sub: 'Your ID card number', status: 'live', verify: 'instant',
        fields: [F.keId], keepReady: ['National ID'], provider: 'IPRS identity check' },
      PASSPORT,
    ],
  },
  SE: { methods: [PASSPORT, soon('bankid_se', 'BankID', 'Sign in with BankID', 'BankID (Sweden)')] },
  NO: { methods: [PASSPORT, soon('bankid_no', 'BankID', 'Sign in with BankID', 'BankID (Norway)')] },
  DK: { methods: [PASSPORT, soon('mitid', 'MitID', 'Sign in with MitID', 'MitID')] },
  EE: { methods: [PASSPORT, soon('smart_id_ee', 'Smart-ID', 'Confirm in the Smart-ID app', 'Smart-ID')] },
  LV: { methods: [PASSPORT, soon('smart_id_lv', 'Smart-ID', 'Confirm in the Smart-ID app', 'Smart-ID')] },
  LT: { methods: [PASSPORT, soon('smart_id_lt', 'Smart-ID', 'Confirm in the Smart-ID app', 'Smart-ID')] },
  BE: { methods: [PASSPORT, soon('itsme', 'itsme', 'Confirm in the itsme app', 'itsme')] },
  IT: { methods: [PASSPORT, soon('spid', 'SPID or CIE', 'Sign in with SPID or your electronic ID card', 'SPID / CIE')] },
  DE: { methods: [PASSPORT, soon('eid_de', 'Online ID card', 'Tap your ID card on your phone', 'German eID (Online-Ausweisfunktion)')] },
};
const DEFAULT = { methods: [PASSPORT] };

function kycFor(countryIso) {
  const iso = String(countryIso || '').toUpperCase();
  const c = COUNTRIES[iso] || DEFAULT;
  return { iso, ...c };
}

// What the phone is told. Validators and storage rules stay here.
function publicKyc(countryIso) {
  const c = kycFor(countryIso);
  const live = c.methods.filter((m) => m.status === 'live');
  return {
    country: c.iso,
    postcodeLabel: c.postcodeLabel || 'Postcode',
    incomeCurrency: c.incomeCurrency || '',
    incomeUnit: c.incomeUnit || '',
    keepReady: [...new Set((live[0] && live[0].keepReady) || ['Passport'])],
    methods: c.methods.map((m) => ({
      key: m.key, label: m.label, sub: m.sub, status: m.status, verify: m.verify || null, otpTo: m.otpTo || null,
      provider: m.provider,
      fields: (m.fields || []).map(({ key, label, placeholder, inputMode, group, maxDigits, maxLength, secure, upper, type }) => ({ key, label, placeholder, inputMode, group, maxDigits, maxLength, secure, upper, type })),
    })),
  };
}

// Checks one submission against the account's country. Returns
// { method, values } with clean values, or { error, field }.
function checkSubmission(countryIso, methodKey, rawValues) {
  const c = kycFor(countryIso);
  const method = c.methods.find((m) => m.key === methodKey);
  if (!method) return { error: 'That way of proving your identity is not used where your account is registered.', code: 'method_not_for_country' };
  if (method.status !== 'live') return { error: `${method.label} is coming soon. Use another option for now.`, code: 'method_not_live' };
  const values = {};
  for (const f of method.fields) {
    const clean = VALIDATOR_FOR[f.key] ? VALIDATOR_FOR[f.key](rawValues && rawValues[f.key]) : null;
    if (!clean) return { error: f.error, field: f.key };
    values[f.key] = clean;
  }
  return { method, values };
}

module.exports = { kycFor, publicKyc, checkSubmission, verhoeffValid, cpfValid, COUNTRIES, VALIDATORS: V };

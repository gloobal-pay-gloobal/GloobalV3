// src/components/payments/PayPinModal.jsx
// The PIN confirmation in front of Scan & Pay and Pay a Business.
//
// It used to compare what was typed against SEND_OTP — the literal
// "123456" declared in SendMoney.jsx — so the person's real PIN was never
// checked: 123456 opened anyone's payment, and their actual PIN was
// rejected. Same defect Send Money had; this is the other half of it.
//
// Now POST /api/pin/verify decides, the same route login uses, against the
// bcrypt hash the backend holds. That also brings the backend's own
// answers with it: five wrong tries locks the PIN for ten minutes and says
// so, which a local string compare could never report.
//
// The verified PIN is handed to onVerified(pin), because Scan & Pay now goes
// on to POST /api/transactions/send and that route bcrypt-checks the PIN in
// its own body. This modal used to check the PIN and then throw it away, on
// the reasoning that both callers only ever posted to the local ledger — true
// when it was written, and the reason a scanned payment never reached the
// backend at all.
//
// The value is passed, not stored: it lives in the caller's ref only until the
// send it authorises settles. Callers that stay local (Pay a Business, whose
// payee is not a Gloobal account) simply ignore the argument.
function PayPinModal({ open, onClose, amountLabel, onVerified }) {
  const [pin, setPin] = useState("");
  const [pinRevealed, setPinRevealed] = useState(false);
  const [pinError, setPinError] = useState(null);
  const [checking, setChecking] = useState(false);
  const errorTimer = useRef2(null);
  useEffect(() => {
    if (!open) {
      setPin("");
      setPinError(null);
      setChecking(false);
      if (errorTimer.current) {
        clearTimeout(errorTimer.current);
        errorTimer.current = null;
      }
    }
  }, [open]);
  useEffect(() => {
    if (pin.length < 6 || checking) return;
    let cancelled = false;
    (async () => {
      setChecking(true);
      setPinError(null);
      const symbolId = gloobalCurrentSymbolId();
      try {
        // No signed-in account on this device means there is no PIN on
        // file to check against — the local-simulation path this build
        // still supports. Nothing is verified because nothing real is
        // being paid.
        if (symbolId) await GloobalApi.verifyPin(symbolId, pin);
        if (cancelled) return;
        setChecking(false);
        // Named before the on-screen buffer is cleared. `pin` is this render's
        // binding and setPin does not change it, so this is for the reader
        // rather than the machine — but the equivalent slip one component over
        // is what made Send Money unfinishable, so the order is kept explicit.
        const verified = pin;
        setPin("");
        onVerified(verified);
      } catch (err) {
        if (cancelled) return;
        setChecking(false);
        // A request that never got an answer judged nothing — saying
        // "incorrect" there would be telling someone their own PIN is
        // wrong because the server was asleep.
        setPinError(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
        errorTimer.current = setTimeout(() => {
          setPin("");
          setPinError(null);
        }, 900);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin]);
  if (!open) return null;
  return <div
    style={{ position: "fixed", inset: 0, zIndex: 520, background: "rgba(15,12,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    role="dialog"
    aria-modal="true"
    aria-label="Enter your PIN to confirm payment"
  ><div style={{ width: "100%", maxWidth: 360, background: T.bg, borderRadius: T.radiusXl, padding: "26px 22px 24px", position: "relative" }}><button
    onClick={onClose}
    aria-label="Cancel"
    className="v2-tap"
    style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><X4 size={16} color={T.inkFaint} /></button><div style={{ width: 44, height: 44, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Lock size={20} color={T.accent} /></div><h3 style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, margin: "0 0 4px" }}>
        Enter PIN
      </h3>{amountLabel && <div style={{ borderRadius: T.radiusMd, border: `1px solid ${T.line}`, background: T.surfaceAlt, padding: "12px 16px", textAlign: "center", margin: "14px 0 4px", fontSize: 20, fontWeight: 800, color: T.negative, fontFamily: T.fontDisplay }}>{amountLabel}</div>}{
    /* The backend's own message rather than a flat "Incorrect": it
       distinguishes a wrong PIN from a locked one, and that difference
       matters to whoever is holding the phone. */
  }{pinError && <div role="alert" style={{ fontSize: 12, color: T.negative, fontWeight: 700, textAlign: "center", marginTop: 6, lineHeight: 1.4 }}>{pinError}</div>}<div style={{ marginTop: 14 }}><PhoneDialPad
    value={pin}
    onChange={setPin}
    minLength={6}
    maxLength={6}
    masked={!pinRevealed}
    onToggleMask={() => setPinRevealed((v) => !v)}
  /></div></div></div>;
}
function ProfileSetupScreen({ onBack, onSubmit, photo, onChangePhoto, docType, onSelectDocType, name, onChangeName }) {
  const fileInputRef = useRef4(null);
  const isDefaultPhoto = photo === G_LOGO_DATA_URI;
  // All three are required now. The photo used to be optional — the
  // Gloobal mark stood in for it indefinitely — which meant accounts could
  // reach the dashboard with no picture at all. `isDefaultPhoto` is the
  // test for "nothing was chosen", since the placeholder is a known data
  // URI rather than an empty value. Two characters is the floor on the
  // name so a single stray keystroke does not count as one.
  const canSubmit = !!docType && name.trim().length >= 2 && !isDefaultPhoto;
  const [logoHeroColor, setLogoHeroColor] = useState6(() => randomLogoFlipColor());
  useEffect6(() => {
    if (!isDefaultPhoto) return;
    const interval = setInterval(() => {
      setLogoHeroColor((prev) => randomLogoFlipColor(prev));
    }, 3e3);
    return () => clearInterval(interval);
  }, [isDefaultPhoto]);
  const DOC_TYPES = [
    { key: "bank", label: "Bank Statement", Icon: Landmark2 },
    { key: "license", label: "Driving Licence", Icon: Car2 },
    { key: "passport", label: "Passport", Icon: Globe2 }
  ];
  // Downscaled before it is ever handed upward. A phone camera photo is
  // 3-8 MB, and base64 inflates that by a third — well past the ~5 MB
  // localStorage quota the profile is saved into. The write throws
  // QuotaExceededError, which is swallowed, so the photo would appear to
  // be accepted and then silently be gone on the next load; a near-quota
  // write can also crowd out the saved session, which shares the same
  // origin storage. Now that a photo is mandatory, that was the common
  // case rather than an edge one.
  //
  // 512px on the long edge at JPEG 0.82 lands around 40-60 KB, which is
  // far more than a 96px avatar needs. Anything that fails to decode
  // falls back to the original data URL rather than losing the pick.
  const PHOTO_MAX_EDGE = 512;
  const downscalePhoto = (dataUrl) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (err) {
          // Tainted canvas, no 2d context, or a browser that refuses the
          // export — the original still works, it just costs more storage.
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => onChangePhoto(await downscalePhoto(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
  ><div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px",
      flexShrink: 0
    }}
  ><NavBackButton onClick={onBack} style={{
      flexShrink: 0
     }} /><span style={{ flex: 1, textAlign: "center", fontFamily: T.fontDisplay, fontSize: 18, color: T.ink, marginRight: 40 }}><SingleOMark before="" after="NE" /> <span style={{ fontWeight: 500 }}>last step</span></span></div><div
    style={{
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "6px 24px 40px",
      boxSizing: "border-box"
    }}
  ><div
    style={{
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 22,
      padding: "26px 20px",
      borderRadius: T.radiusLg,
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxShadow: T.shadowCard,
      boxSizing: "border-box"
    }}
  >{
    /* Profile photo — defaults to the Gloobal 'g' mark until replaced */
  }<div style={{ position: "relative" }}><button
    onClick={() => fileInputRef.current && fileInputRef.current.click()}
    aria-label="Change profile photo"
    className="v2-tap"
    style={{
      width: 96,
      height: 96,
      borderRadius: "50%",
      border: `1.5px solid ${T.line}`,
      background: isDefaultPhoto ? logoHeroColor : T.surface,
      boxShadow: isDefaultPhoto ? `0 10px 24px ${logoHeroColor}40` : T.shadowCard,
      padding: 0,
      cursor: "pointer",
      overflow: "hidden",
      transition: "background 0.4s ease, box-shadow 0.4s ease"
    }}
  ><img
    src={photo}
    alt="Profile"
    style={{
      width: "100%",
      height: "100%",
      objectFit: isDefaultPhoto ? "contain" : "cover",
      padding: isDefaultPhoto ? 13 : 0,
      boxSizing: "border-box",
      filter: isDefaultPhoto ? "brightness(0) invert(1)" : "none"
    }}
  /></button><span
    style={{
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: T.gradButton,
      border: `2px solid ${T.bg}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      boxShadow: T.shadowCard
    }}
  ><Plus2 size={16} strokeWidth={2.75} /></span><input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} /></div>{
    /* Says why Continue is greyed out while the placeholder is still
       showing. A disabled button with no reason attached reads as a
       broken screen. */
  }{isDefaultPhoto && <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, textAlign: "center", marginTop: -12 }}>
            Tap to add a profile photo
          </span>}{
    /* Document type — mandatory single pick */
  }<div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint }}>
            Verify with a document
          </span><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>{DOC_TYPES.map(({ key, label, Icon }) => {
    const active = docType === key;
    return <button
      key={key}
      onClick={() => onSelectDocType(key)}
      className="v2-tap"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "14px 6px",
        borderRadius: T.radiusMd,
        border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.line}`,
        background: active ? T.accentSoft : T.surface,
        cursor: "pointer",
        boxShadow: active ? "none" : T.shadowCard
      }}
    ><Icon size={20} color={active ? T.accent : T.inkSoft} /><span style={{ fontSize: 10.5, fontWeight: 700, color: active ? T.accent : T.inkSoft, textAlign: "center", lineHeight: 1.25 }}>{label}</span></button>;
  })}</div></div>{
    /* Documented name — pre-filled but editable, must stay non-empty */
  }<div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint }}>
            Name on document
          </span><input
    value={name}
    onChange={(e) => onChangeName(e.target.value)}
    // PUT /api/profile/:symbolId rejects anything over 80 characters with a
    // 400, and that route is the only one that stores a real name (register
    // -symbol overwrites fullName with the mobile number). Without this cap
    // a long name is accepted here, 400s during registration, and the
    // account quietly keeps the phone number as its display name.
    maxLength={80}
    placeholder="Full name as shown on document"
    style={{
      width: "100%",
      boxSizing: "border-box",
      padding: "14px 16px",
      borderRadius: T.radiusMd,
      border: `1px solid ${T.line}`,
      background: T.surface,
      fontSize: 14.5,
      fontWeight: 700,
      color: T.ink,
      boxShadow: T.shadowCard
    }}
  /></div></div><button
    onClick={onSubmit}
    disabled={!canSubmit}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "15px 0",
      color: "#fff",
      fontSize: 14,
      fontWeight: 800,
      background: canSubmit ? T.gradButton : T.gradButtonDisabled,
      boxShadow: canSubmit ? "0 8px 20px rgba(124,58,237,0.32)" : "none",
      cursor: canSubmit ? "pointer" : "not-allowed",
      opacity: canSubmit ? 1 : 0.7,
      marginTop: 22
    }}
  >
          Continue
        </button></div></div>;
}


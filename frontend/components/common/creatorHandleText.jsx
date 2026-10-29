// src/components/common/creatorHandleText.jsx
//
// A SHOP'S CREATOR NAME, WRITTEN THE WAY IT IS SAID: rasoi.ghar
//
// The founder: a payment made to a shop should show up under the shop's
// creator name — rasoi.ghar — not the owner's own name, so personal and
// shop payments can be told apart at a glance; and the dot in it in a
// different colour, picked at random. The colour is picked once per row
// (when it first appears), from the same palette as the logo's flips, so a
// list does not flicker while it is read.
import { useState as useState70 } from "react";
import { Store as StoreHandle } from "lucide-react";

function CreatorHandleText({ handle, icon = true, dotSize = "1.25em" }) {
  const [dotColor] = useState70(() => LOGO_FLIP_COLORS[Math.floor(Math.random() * LOGO_FLIP_COLORS.length)]);
  const text = String(handle || "");
  const at = text.indexOf(".");
  return <span data-creator-handle="" style={{ display: "inline-flex", alignItems: "baseline", gap: 5, minWidth: 0, maxWidth: "100%" }}>{icon ? <StoreHandle
    size={13}
    color={T.accent}
    aria-hidden="true"
    style={{ flexShrink: 0, alignSelf: "center" }}
  /> : null}<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{at < 0
    ? text
    : <>{text.slice(0, at)}<span aria-hidden="false" style={{ color: dotColor, fontWeight: 900, fontSize: dotSize, lineHeight: 0, margin: "0 1px" }}>.</span>{text.slice(at + 1)}</>}</span></span>;
}

"use client";

import { useEffect } from "react";

const CODE_PATTERN = /^GARA-[A-Z2-9]{7}$/;

/**
 * Reports a Campus Ambassador referral code from the address (`?ref=CODE`) once per browser
 * session; the server checks it and remembers it in an httpOnly cookie. Renders nothing.
 */
export function ReferralCapture() {
  useEffect(() => {
    let code: string | null = null;
    try {
      code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() ?? null;
    } catch {
      return;
    }
    if (!code || !CODE_PATTERN.test(code)) return;
    const key = `gara_ref_sent:${code}`;
    try {
      if (window.sessionStorage.getItem(key) === "1") return;
    } catch {
      // Storage unavailable: report anyway (the server rate-limits).
    }
    fetch("/api/referrals/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      keepalive: true,
    })
      .then(() => {
        try {
          window.sessionStorage.setItem(key, "1");
        } catch {
          // Ignore.
        }
      })
      .catch(() => {
        // Referral tracking must never affect the page.
      });
  }, []);
  return null;
}

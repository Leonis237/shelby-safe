"use client";

import { useWallet } from "@/components/wallet-provider";
import { ConnectWallet } from "@/components/connect-wallet";
import { deriveKey, encrypt, decrypt, signForEncryption } from "@/lib/encryption";
import {
  getShelbyClient, createMinimalAccount, uploadEncryptedBlob,
  listAccountBlobs, downloadBlob, parseBlobName, generateBlobName, resetShelbyClient,
} from "@/lib/shelby";
import type { VaultNote } from "@/lib/types";
import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */

function sigToHex(sig: unknown): string {
  if (typeof sig === "string") return sig;
  if (sig instanceof Uint8Array) return Array.from(sig).map(b => b.toString(16).padStart(2, "0")).join("");
  if (Array.isArray(sig) && sig.every(v => typeof v === "number")) return sig.map((b: number) => b.toString(16).padStart(2, "0")).join("");
  return String(sig ?? "");
}

function toUint8Array(sig: unknown): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (Array.isArray(sig) && sig.every(v => typeof v === "number")) return new Uint8Array(sig);
  const hex = typeof sig === "string" ? (sig.startsWith("0x") ? sig.slice(2) : sig) : "";
  if (!hex) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

const SIG_CACHE_PREFIX = "shelbysafe-sig:";
function getCachedSig(addr: string): string | null {
  try { return sessionStorage.getItem(SIG_CACHE_PREFIX + addr); } catch { return null; }
}
function setCachedSig(addr: string, sig: string): void {
  try { sessionStorage.setItem(SIG_CACHE_PREFIX + addr, sig); } catch {}
}
function clearCachedSig(addr: string): void {
  try { sessionStorage.removeItem(SIG_CACHE_PREFIX + addr); } catch {}
}

/* ═══════════════════════════════════════════════════════
   MAXIMALISM COLOR CYCLE
   ═══════════════════════════════════════════════════════ */

const ACCENTS = [
  { name: "pink",   bg: "#FF71C6", glow: "shadow-glow-pink", border: "border-[#FF71C6]" },
  { name: "cyan",   bg: "#00E5FF", glow: "shadow-glow-cyan", border: "border-[#00E5FF]" },
  { name: "gold",   bg: "#D18800", border: "border-[#D18800]" },
  { name: "purple", bg: "#7B2FFF", border: "border-[#7B2FFF]" },
  { name: "coral",  bg: "#FF8AC4", border: "border-[#FF8AC4]" },
];

const BORDERS = ["border-solid", "border-dashed", "border-solid", "border-dashed", "border-dotted"];
const SHADOWS = ["shadow-stacked", "shadow-stacked-cyan", "shadow-stacked-triple", "shadow-combined", "shadow-stacked"];

function accentFor(i: number) { return ACCENTS[i % ACCENTS.length]; }
function borderStyleFor(i: number) { return BORDERS[i % BORDERS.length]; }
function shadowFor(i: number) { return SHADOWS[i % SHADOWS.length]; }

/* ═══════════════════════════════════════════════════════
   FLOATING SHAPES (decorative)
   ═══════════════════════════════════════════════════════ */

const SHAPES = [
  { emoji: "\u2728", size: "text-4xl", anim: "animate-float", pos: "top-[10%] left-[5%]" },
  { emoji: "\uD83D\uDD12", size: "text-5xl", anim: "animate-float-reverse", pos: "top-[20%] right-[8%]" },
  { emoji: "\uD83D\uDC8E", size: "text-3xl", anim: "animate-bounce-subtle", pos: "bottom-[15%] left-[10%]" },
  { emoji: "\u26A1", size: "text-4xl", anim: "animate-float", pos: "bottom-[25%] right-[12%]" },
  { emoji: "\uD83C\uDF1F", size: "text-2xl", anim: "animate-wiggle", pos: "top-[60%] left-[3%]" },
  { emoji: "\uD83D\uDCAC", size: "text-3xl", anim: "animate-float-reverse", pos: "top-[40%] right-[4%]" },
];

function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {SHAPES.map((s, i) => (
        <span
          key={i}
          className={`absolute ${s.pos} ${s.size} ${s.anim} opacity-30 select-none`}
          style={{ animationDelay: `${i * 0.7}s` }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   VAULT ITEM — DOUBLE-BEZEL + SHADOW
   ═══════════════════════════════════════════════════════ */

function VaultItem({
  note,
  index,
  onClick,
}: {
  note: VaultNote;
  index: number;
  onClick: () => void;
}) {
  const a = accentFor(index);
  const bs = borderStyleFor(index);
  const sh = shadowFor(index);
  const y = index % 2 === 0 ? "" : "md:translate-y-4";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left group mb-4 ${y} transition-all duration-300 hover:scale-[1.02] active:scale-95`}
    >
      <div
        className={`rounded-3xl border-4 ${bs} ${a.border} ${sh} p-[2px] bg-[#1A1218]/60 backdrop-blur-sm
                    hover:shadow-stacked-triple hover:border-[#FF71C6] transition-all duration-300`}
      >
        <div className="rounded-[calc(1.5rem-2px)] bg-[#0A0A0A] px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-[family-name:var(--font-display)] shrink-0"
                style={{ backgroundColor: a.bg + "20", color: a.bg }}
              >
                {index + 1}
              </span>
              <span className="text-white font-[family-name:var(--font-heading)] font-bold text-sm truncate group-hover:text-[#FF71C6] transition-colors">
                {note.title}
              </span>
            </div>
            <span className="font-[family-name:var(--font-dm-mono)] text-[10px] text-white/40 tabular-nums shrink-0 ml-4 uppercase tracking-widest">
              {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   SKELETON LOADER
   ═══════════════════════════════════════════════════════ */

function SkeletonLoader() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map(i => {
        const a = accentFor(i);
        return (
          <div
            key={i}
            className={`rounded-3xl border-4 ${borderStyleFor(i)} opacity-30 p-6 ${i % 2 === 1 ? "md:translate-y-4" : ""}`}
            style={{ borderColor: a.bg + "40" }}
          >
            <div className="flex items-center justify-between">
              <div className="h-5 bg-white/5 rounded-full animate-pulse w-48" />
              <div className="h-3 bg-white/5 rounded-full animate-pulse w-16" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EMPTY VAULT STATE
   ═══════════════════════════════════════════════════════ */

function EmptyVault({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center relative">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-[#1A1218] border-4 border-dashed border-[#FF71C6] flex items-center justify-center shadow-glow-pink animate-pulse-glow">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF71C6" strokeWidth="2.5" className="drop-shadow-[0_0_8px_rgba(255,113,198,0.5)]">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <span className="absolute -top-2 -right-2 text-2xl animate-bounce-subtle">✨</span>
      </div>
      <h3 className="font-[family-name:var(--font-heading)] font-black text-2xl text-white mb-2 text-shadow-double uppercase tracking-tight">
        Vault is empty
      </h3>
      <p className="text-white/40 text-base max-w-xs mb-8 leading-relaxed font-[family-name:var(--font-body)]">
        Notes live on Shelby Protocol — encrypted, decentralized,
        readable only by your wallet.
      </p>
      <button
        onClick={onCreate}
        className="bg-gradient-to-r from-[#FF71C6] via-[#7B2FFF] to-[#00E5FF] text-white
                   border-4 border-[#D18800] rounded-full
                   font-[family-name:var(--font-heading)] font-black uppercase tracking-widest
                   h-14 px-10 shadow-combined
                   hover:scale-110 hover:shadow-stacked-triple
                   active:scale-95
                   transition-all duration-300"
      >
        Create first note
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DEMO ENCRYPTION
   ═══════════════════════════════════════════════════════ */

function DemoEncryption() {
  const [input, setInput] = useState("my secret recovery phrase \uD83D\uDD10");
  const [encrypted, setEncrypted] = useState("");
  const [demoKey, setDemoKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]).then(setDemoKey);
  }, []);

  const doEncrypt = async () => {
    if (!demoKey || !input) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, demoKey, new TextEncoder().encode(input));
    const combined = new Uint8Array(iv.length + ct.byteLength);
    combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.length);
    let b = ""; for (let i = 0; i < Math.min(combined.length, 200); i++) b += String.fromCharCode(combined[i]);
    setEncrypted(btoa(b).slice(0, 96) + "...");
  };

  return (
    <div className="group">
      <div className="rounded-3xl border-4 border-dashed border-[#00E5FF] shadow-stacked-cyan p-[2px] bg-[#1A1218]/60 backdrop-blur-sm
                      hover:border-[#FF71C6] hover:shadow-combined transition-all duration-500">
        <div className="rounded-[calc(1.5rem-2px)] bg-[#0A0A0A] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-[family-name:var(--font-heading)] font-black text-white text-lg uppercase tracking-tight text-shadow-single">
              See it in action
            </h3>
            <span className="font-[family-name:var(--font-dm-mono)] text-[10px] text-[#FF71C6] uppercase tracking-[0.2em] font-bold border-2 border-[#FF71C6]/30 rounded-full px-3 py-1">
              AES-256-GCM
            </span>
          </div>
          <div className="space-y-4">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              className="w-full bg-[#1A1218]/50 border-4 border-[#FF71C6]/30 rounded-full text-white
                         font-[family-name:var(--font-body)] text-lg px-6 py-4
                         placeholder:text-white/30
                         focus:border-[#00E5FF] focus:shadow-glow-cyan
                         focus:ring-4 focus:ring-[#FF71C6]/20 focus:ring-offset-2 focus:ring-offset-[#D18800]/20
                         transition-all duration-300"
              placeholder="Type something secret..."
            />
            <button
              onClick={doEncrypt}
              className="bg-gradient-to-r from-[#FF71C6] to-[#00E5FF] text-white
                         border-4 border-[#D18800] rounded-full
                         font-[family-name:var(--font-heading)] font-black uppercase tracking-widest text-xs
                         px-8 py-3 shadow-stacked
                         hover:scale-105 hover:shadow-stacked-triple
                         active:scale-95
                         transition-all duration-300"
            >
              Encrypt
            </button>
            {encrypted && (
              <div className="bg-[#1A1218] rounded-2xl border-4 border-[#7B2FFF]/30 p-4">
                <p className="text-[10px] text-[#D18800] font-[family-name:var(--font-dm-mono)] uppercase tracking-[0.2em] mb-2 font-bold">
                  Ciphertext
                </p>
                <p className="text-white/50 font-[family-name:var(--font-dm-mono)] text-xs break-all leading-relaxed">
                  {encrypted}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FEATURE CARD
   ═══════════════════════════════════════════════════════ */

function FeatureCard({ title, desc, icon, index }: { title: string; desc: string; icon: React.ReactNode; index: number }) {
  const a = accentFor(index);
  const bs = borderStyleFor(index);
  const sh = shadowFor(index);
  const y = index % 2 === 1 ? "md:translate-y-6" : "";

  return (
    <div className={`group ${y} transition-all duration-300 hover:scale-[1.02]`}>
      <div
        className={`rounded-3xl border-4 ${bs} ${sh} p-[2px] bg-[#1A1218]/60 backdrop-blur-sm h-full
                    hover:shadow-stacked-triple transition-all duration-300`}
        style={{ borderColor: a.bg }}
      >
        <div className="rounded-[calc(1.5rem-2px)] bg-[#0A0A0A] p-6 h-full">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4
                       group-hover:scale-110 group-hover:rotate-3 transition-all duration-300"
            style={{ backgroundColor: a.bg + "20", border: `3px solid ${a.bg}40` }}
          >
            {icon}
          </div>
          <h3 className="font-[family-name:var(--font-heading)] font-black text-white text-lg mb-2 text-shadow-single uppercase tracking-tight">
            {title}
          </h3>
          <p className="text-white/50 text-sm leading-relaxed font-[family-name:var(--font-body)]">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN VAULT COMPONENT
   ═══════════════════════════════════════════════════════ */

export function Vault() {
  const { connected, account, signMessage } = useWallet();
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<VaultNote | null>(null);
  const [viewingContent, setViewingContent] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const initRef = useRef(false);

  const initCrypto = useCallback(async () => {
    if (!connected || !signMessage || !account) return;
    const addr = account.address;
    const cached = getCachedSig(addr);

    // Build sign handler from wallet
    const signHandler = async (_acct: any, challenge: string) => {
      const r = await signMessage({ message: challenge, nonce: Date.now().toString() });
      return { challenge, signature: toUint8Array(r.signature), publicKey: toUint8Array(account.publicKey) };
    };

    if (cached) {
      setCryptoKey(await deriveKey(cached));
      getShelbyClient(undefined, signHandler);
      return;
    }
    try {
      const sigHex = await signForEncryption(async (msg) => {
        const r = await signMessage({ message: msg, nonce: Date.now().toString() });
        return sigToHex(r.signature);
      });
      setCachedSig(addr, sigHex);
      setCryptoKey(await deriveKey(sigHex));
      getShelbyClient(undefined, signHandler);
    } catch (e) {
      console.error("[ShelbySafe] initCrypto failed:", e);
      setError(e instanceof Error ? e.message : "Failed to unlock vault");
    }
  }, [connected, signMessage, account]);

  useEffect(() => {
    // Don't auto-sign — user clicks "Unlock Vault" button instead
  }, []);

  const loadNotes = useCallback(async () => {
    if (!connected || !account) return;
    setLoading(true); setError(null);
    try {
      const blobs = await listAccountBlobs(account.address);
      setNotes(blobs.filter(b => b.name.startsWith("shelbysafe-")).map(b => {
        const { timestamp } = parseBlobName(b.name);
        const titlePart = b.name.replace("shelbysafe-", "").replace(/^\d+-/, "");
        return {
          id: b.name, title: titlePart || "Untitled", content: "",
          contentType: "note" as const, createdAt: timestamp || Date.now(), version: 1 as const,
        };
      }));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [connected, account]);

  useEffect(() => { if (cryptoKey) loadNotes(); }, [loadNotes, cryptoKey]);

  const handleSave = async () => {
    if (!account || !cryptoKey || !newTitle.trim()) return;
    setSaving(true); setError(null);
    try {
      const encrypted = await encrypt(cryptoKey, JSON.stringify({
        id: "", title: newTitle, content: newContent, contentType: "note", createdAt: Date.now(), version: 1,
      }));
      await uploadEncryptedBlob({
        data: new TextEncoder().encode(encrypted),
        blobName: generateBlobName(),
        account: createMinimalAccount(account.address, sigToHex(account.publicKey)),
        ttlDays: 365,
      });
      setNewTitle(""); setNewContent(""); setShowNew(false);
      await loadNotes();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const handleView = async (id: string) => {
    if (!account || !cryptoKey) return;
    setDecrypting(true);
    try {
      const data = await downloadBlob(account.address, id);
      const json = await decrypt(cryptoKey, new TextDecoder().decode(data));
      const parsed = JSON.parse(json);
      setSelectedNote(parsed);
      setViewingContent(parsed.content || "");
    } catch { setError("Decrypt failed. Wrong wallet or data corrupted."); }
    finally { setDecrypting(false); }
  };

  useEffect(() => {
    if (!connected) {
      setCryptoKey(null); setNotes([]); initRef.current = false;
      if (account) clearCachedSig(account.address);
      resetShelbyClient();
    }
  }, [connected, account]);

  /* ═══════════════════════════════════════════════════
     LANDING PAGE
     ═══════════════════════════════════════════════════ */

  if (!connected) {
    return (
      <div className="min-h-[100dvh] bg-[#0A0A0A] relative overflow-hidden">
        {/* GLOBAL PATTERN LAYERS */}
        <div className="fixed inset-0 pattern-stripes z-0 pointer-events-none" aria-hidden="true" />
        <div className="fixed inset-0 pattern-dots z-0 pointer-events-none" aria-hidden="true" />

        {/* NAV */}
        <nav className="relative z-20 max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="font-[family-name:var(--font-heading)] font-black text-white text-3xl tracking-tight uppercase">
            Shelby<span className="text-[#FF71C6]">Safe</span>
          </span>
          <ConnectWallet />
        </nav>

        {/* HERO — MEGA TEXT + FLOATING SHAPES */}
        <section className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20 md:pt-36 md:pb-28">
          <FloatingShapes />

          {/* MASSIVE BG TYPOGRAPHY */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0" aria-hidden="true">
            <span className="font-[family-name:var(--font-display)] text-[14rem] md:text-[22rem] text-white/[0.03] leading-none select-none tracking-tighter">
              SHELBY
            </span>
          </div>

          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-3 mb-8">
              <span className="w-12 h-1 bg-[#FF71C6] rounded-full animate-pulse-glow" />
              <p className="font-[family-name:var(--font-dm-mono)] text-xs text-[#D18800] uppercase tracking-[0.25em] font-bold">
                Shelby Protocol / Aptos
              </p>
            </div>

            <h1 className="font-[family-name:var(--font-heading)] font-black text-6xl md:text-7xl lg:text-8xl text-white uppercase
                           tracking-tighter leading-[0.9] mb-8 text-shadow-mega">
              Your vault.<br />
              <span className="gradient-text animate-gradient-shift">Your keys.</span><br />
              Zero trust.
            </h1>

            <p className="text-white/40 text-lg md:text-xl max-w-lg mb-10 leading-relaxed font-[family-name:var(--font-body)]">
              Encrypted storage on Shelby decentralized infrastructure.
              No server ever sees your data. Only your wallet can decrypt.
            </p>

            <ConnectWallet />
          </div>

          {/* DECORATIVE LOCK ICON — floating */}
          <div className="hidden lg:block absolute right-10 top-1/2 -translate-y-1/2 z-0 pointer-events-none" aria-hidden="true">
            <div className="w-72 h-72 rounded-[3rem] bg-[#1A1218] border-4 border-dashed border-[#FF71C6]/30
                            flex items-center justify-center shadow-glow-pink animate-float">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#FF71C6" strokeWidth="1.5" className="drop-shadow-[0_0_20px_rgba(255,113,198,0.4)]">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                <circle cx="12" cy="16" r="1" />
              </svg>
            </div>
          </div>
        </section>

        {/* FEATURES — BROKEN GRID, CYCLING COLORS */}
        <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
          <div className="mb-16">
            <h2 className="font-[family-name:var(--font-heading)] font-black text-5xl md:text-6xl text-white uppercase tracking-tighter text-shadow-triple">
              What you can lock
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {[
              {
                title: "Seed Phrases & Keys",
                desc: "Recovery phrases, API credentials, private keys. Encrypted with your wallet signature — no server can read them.",
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>,
              },
              {
                title: "Trading Journal",
                desc: "Strategies, trade notes, and research. Immutable record on Aptos, readable only by you.",
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
              },
              {
                title: "Sensitive Documents",
                desc: "Legal docs, contracts, personal records. No backdoor. No platform risk. End-to-end encrypted.",
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
              },
              {
                title: "No Server Access",
                desc: "Encryption happens in your browser. Shelby stores ciphertext only. Even we can't read your data.",
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
              },
            ].map((f, i) => (
              <FeatureCard key={f.title} {...f} index={i} />
            ))}
          </div>
        </section>

        {/* DEMO — pattern-stripes section bg */}
        <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
          <div className="relative rounded-[2.5rem] overflow-hidden">
            <div className="absolute inset-0 pattern-stripes-gold pattern-checker z-0 pointer-events-none" aria-hidden="true" />
            <div className="relative z-10 max-w-lg">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full bg-[#FF71C6] animate-pulse-glow" />
                <p className="text-[#D18800] font-[family-name:var(--font-dm-mono)] text-[10px] uppercase tracking-[0.25em] font-bold">
                  How encryption works
                </p>
              </div>
              <DemoEncryption />
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative z-10 border-t-4 border-dashed border-[#FF71C6]/20 py-8 text-center">
          <p className="font-[family-name:var(--font-dm-mono)] text-[10px] text-white/20 uppercase tracking-[0.25em] font-bold">
            Shelby Protocol &bull; Aptos &bull; End-to-end encrypted
          </p>
        </footer>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     UNLOCKING STATE
     ═══════════════════════════════════════════════════ */

  if (!cryptoKey) {
    return (
      <div className="min-h-[100dvh] bg-[#0A0A0A] flex items-center justify-center">
        <div className="fixed inset-0 pattern-stripes pattern-dots z-0 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-2xl bg-[#1A1218] border-4 border-dashed border-[#FF71C6] mx-auto mb-6 animate-pulse-glow flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF71C6" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="text-white/40 font-[family-name:var(--font-dm-mono)] text-sm uppercase tracking-widest mb-6">
            Sign to unlock your vault
          </p>
          {error && (
            <div className="mb-6 rounded-2xl border-4 border-[#FF71C6]/40 bg-[#1A1218]/80 backdrop-blur-sm p-4">
              <p className="text-[#FF71C6] text-xs font-[family-name:var(--font-dm-mono)] break-all leading-relaxed">{error}</p>
            </div>
          )}
          <button
            onClick={() => { setError(null); initCrypto(); }}
            className="bg-gradient-to-r from-[#FF71C6] via-[#7B2FFF] to-[#00E5FF] text-white
                       border-4 border-[#D18800] rounded-full
                       font-[family-name:var(--font-heading)] font-black uppercase tracking-widest text-sm
                       h-14 px-10 shadow-combined
                       hover:scale-110 hover:shadow-stacked-triple active:scale-95
                       transition-all duration-300 ease-out">
            Unlock Vault
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     VAULT DASHBOARD
     ═══════════════════════════════════════════════════ */

  return (
    <div className="min-h-[100dvh] bg-[#0A0A0A] relative">
      <div className="fixed inset-0 pattern-stripes pattern-dots z-0 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        {/* HEADER */}
        <header className="flex items-center justify-between mb-16">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] font-black text-6xl text-white uppercase tracking-tighter">
              Shelby<span className="text-[#FF71C6]">Safe</span>
            </h1>
            <p className="font-[family-name:var(--font-dm-mono)] text-[10px] text-[#D18800] uppercase tracking-[0.25em] mt-1 font-bold">
              {notes.length} {notes.length === 1 ? "note" : "notes"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ConnectWallet />
            <button
              onClick={() => setShowNew(true)}
              className="bg-gradient-to-r from-[#FF71C6] to-[#00E5FF] text-white
                         border-4 border-[#D18800] rounded-full
                         font-[family-name:var(--font-heading)] font-black uppercase tracking-widest text-xs
                         h-12 px-8 shadow-stacked
                         hover:scale-105 hover:shadow-stacked-triple
                         active:scale-95
                         transition-all duration-300"
            >
              New
            </button>
          </div>
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-12 rounded-2xl border-4 border-[#FF71C6]/40 bg-[#1A1218]/80 backdrop-blur-sm p-4 shadow-glow-pink">
            <div className="flex items-start gap-3">
              <span className="text-[#FF71C6] text-lg font-black shrink-0">!</span>
              <p className="text-white/60 text-sm font-[family-name:var(--font-dm-mono)] break-all leading-relaxed flex-1 min-w-0">{error}</p>
              <button onClick={() => setError(null)} className="text-white/30 hover:text-[#FF71C6] text-xl shrink-0 transition-colors">&times;</button>
            </div>
          </div>
        )}

        {/* NEW NOTE FORM */}
        {showNew && (
          <div className="mb-12">
            <div className="rounded-3xl border-4 border-solid border-[#FF71C6] shadow-combined p-[2px] bg-[#1A1218]/80 backdrop-blur-sm">
              <div className="rounded-[calc(1.5rem-2px)] bg-[#0A0A0A] p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-[family-name:var(--font-heading)] font-black text-white text-xl uppercase tracking-tight text-shadow-single">
                    New Note
                  </h2>
                  <span className="font-[family-name:var(--font-dm-mono)] text-[10px] text-[#FF71C6] uppercase tracking-[0.2em] font-bold border-2 border-dashed border-[#FF71C6]/30 rounded-full px-3 py-1">
                    Encrypted client-side
                  </span>
                </div>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="TITLE"
                  className="w-full bg-transparent text-white font-[family-name:var(--font-heading)] font-black text-2xl
                             p-2 mb-4 placeholder:text-white/15 tracking-tight focus:outline-none uppercase"
                  autoFocus
                />
                <textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="Start writing your encrypted note..."
                  rows={6}
                  className="w-full bg-[#1A1218]/50 border-4 border-[#7B2FFF]/20 rounded-2xl text-white
                             font-[family-name:var(--font-body)] text-base p-4 mb-6
                             placeholder:text-white/25
                             focus:border-[#FF71C6] focus:shadow-glow-pink
                             focus:ring-4 focus:ring-[#FF71C6]/10 focus:ring-offset-2 focus:ring-offset-[#D18800]/10
                             resize-none leading-relaxed transition-all duration-300"
                />
                <div className="flex gap-4">
                  <button
                    onClick={handleSave}
                    disabled={saving || !newTitle.trim()}
                    className="bg-gradient-to-r from-[#FF71C6] via-[#7B2FFF] to-[#00E5FF] text-white
                               border-4 border-[#D18800] rounded-full
                               font-[family-name:var(--font-heading)] font-black uppercase tracking-widest text-xs
                               px-8 py-3 shadow-stacked
                               hover:scale-105 hover:shadow-stacked-triple
                               active:scale-95
                               transition-all duration-300
                               disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {saving ? "\u23F3 Encrypting..." : "Save to Shelby"}
                  </button>
                  <button
                    onClick={() => { setShowNew(false); setNewTitle(""); setNewContent(""); }}
                    className="text-white/40 hover:text-[#FF71C6] font-[family-name:var(--font-heading)] font-black uppercase tracking-widest text-xs
                               border-2 border-dashed border-white/20 hover:border-[#FF71C6] rounded-full px-6 py-3
                               transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NOTES LIST */}
        {loading && notes.length === 0 ? (
          <SkeletonLoader />
        ) : notes.length === 0 ? (
          <EmptyVault onCreate={() => setShowNew(true)} />
        ) : (
          <div>
            {notes.map((note, i) => (
              <VaultItem key={note.id} note={note} index={i} onClick={() => handleView(note.id)} />
            ))}
          </div>
        )}

        {/* FOOTER */}
        <footer className="mt-24 pt-8 border-t-4 border-dashed border-[#FF71C6]/10 text-center">
          <p className="font-[family-name:var(--font-dm-mono)] text-[10px] text-white/15 uppercase tracking-[0.25em] font-bold">
            Shelby Protocol &bull; Aptos &bull; End-to-end encrypted
          </p>
        </footer>
      </div>

      {/* VIEW NOTE MODAL */}
      {selectedNote && (
        <div
          className="fixed inset-0 bg-[#0A0A0A]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => { setSelectedNote(null); setViewingContent(null); }}
        >
          <div
            className="rounded-3xl border-4 border-[#FF71C6] shadow-combined max-w-lg w-full max-h-[80vh] overflow-auto
                       bg-[#0A0A0A]"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#0A0A0A] border-b-4 border-dashed border-[#FF71C6]/20 p-5 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-heading)] font-black text-white text-lg uppercase tracking-tight truncate">
                  {selectedNote.title}
                </h3>
                <p className="font-[family-name:var(--font-dm-mono)] text-[10px] text-[#D18800] mt-1 uppercase tracking-widest">
                  {new Date(selectedNote.createdAt).toLocaleString("en-US", {
                    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                onClick={() => { setSelectedNote(null); setViewingContent(null); }}
                className="text-white/30 hover:text-[#FF71C6] text-2xl shrink-0 ml-4 transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              {decrypting ? (
                <div className="flex items-center justify-center py-12 gap-3">
                  <div className="w-5 h-5 border-4 border-dashed border-[#FF71C6] rounded-full animate-spin-slow" />
                  <span className="text-white/40 font-[family-name:var(--font-dm-mono)] text-sm uppercase tracking-widest">
                    Decrypting...
                  </span>
                </div>
              ) : viewingContent ? (
                <pre className="text-white/80 font-[family-name:var(--font-dm-mono)] text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {viewingContent}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

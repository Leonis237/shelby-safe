"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState } from "react";

export function ConnectWallet() {
  const { connected, account, connect, disconnect, wallets, isLoading } =
    useWallet();
  const [showWallets, setShowWallets] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = (walletName: string) => {
    setConnecting(true);
    try {
      connect(walletName);
    } finally {
      setTimeout(() => setConnecting(false), 1000);
    }
  };

  if (connected && account) {
    const addr = account.address.toString();
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-[#1A1218] border-4 border-[#D18800] rounded-full px-4 py-2 shadow-stacked">
          <span className="w-3 h-3 rounded-full bg-[#FF71C6] animate-pulse-glow" />
          <span className="font-[family-name:var(--font-dm-mono)] text-sm text-white tabular-nums font-bold">
            {addr.slice(0, 6)}...{addr.slice(-4)}
          </span>
        </div>
        <button
          onClick={disconnect}
          className="text-white/60 hover:text-[#FF71C6] text-xs font-[family-name:var(--font-dm-mono)] uppercase tracking-widest font-bold transition-all border-2 border-dashed border-white/20 hover:border-[#FF71C6] rounded-full px-3 py-1.5"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const availableWallets = wallets.filter(
    (w) => w.name === "Petra" || w.name === "Nightly" || w.name === "OKX Wallet"
  );

  return (
    <div className="relative flex flex-col items-start gap-3">
      <button
        onClick={() => setShowWallets(!showWallets)}
        disabled={isLoading || connecting}
        className="group relative overflow-hidden bg-gradient-to-r from-[#FF71C6] via-[#7B2FFF] to-[#00E5FF] text-white
                   border-4 border-[#D18800] rounded-full
                   font-[family-name:var(--font-heading)] font-black uppercase tracking-widest text-sm
                   h-14 px-10 shadow-combined
                   hover:scale-110 hover:shadow-stacked-triple active:scale-95
                   transition-all duration-300 ease-out
                   focus:ring-4 focus:ring-[#FF71C6] focus:ring-offset-4 focus:ring-offset-[#D18800]
                   disabled:opacity-50 disabled:cursor-wait disabled:hover:scale-100"
      >
        <span className="relative z-10">
          {isLoading || connecting ? "Connecting..." : "Connect Wallet"}
        </span>
      </button>

      {showWallets && (
        <div className="absolute top-full mt-2 z-50 bg-[#1A1218] border-4 border-dashed border-[#D18800] rounded-2xl p-2 min-w-[200px] shadow-stacked-triple">
          {availableWallets.length === 0 ? (
            <p className="text-white/40 text-xs font-[family-name:var(--font-dm-mono)] px-4 py-3 text-center">
              No Aptos wallets detected.
              <br />
              <a
                href="https://petra.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF71C6] underline"
              >
                Install Petra
              </a>
            </p>
          ) : (
            availableWallets.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => {
                  handleConnect(wallet.name);
                  setShowWallets(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
              >
                {wallet.icon && (
                  <img
                    src={wallet.icon}
                    alt=""
                    className="w-6 h-6 rounded-lg"
                  />
                )}
                <span className="text-white font-[family-name:var(--font-dm-mono)] text-sm">
                  {wallet.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

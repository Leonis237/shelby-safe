"use client";

import { Network } from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import {
  AptosWalletAdapterProvider,
  useWallet as useAdapterWallet,
} from "@aptos-labs/wallet-adapter-react";
import { createContext, useContext, useCallback, type ReactNode } from "react";

/* ── Wrapped wallet state for backward compatibility ── */
interface WalletAccount {
  address: string;
  publicKey: string;
}
interface WalletState {
  connected: boolean;
  account: WalletAccount | null;
  connect: (address: string, publicKey: string) => void;
  disconnect: () => void;
  signMessage: (args: {
    message: string;
    nonce: string;
  }) => Promise<{ signature: string | Uint8Array; fullMessage: string }>;
  /** Sign + submit an Aptos transaction via the connected wallet. */
  signAndSubmit: (
    payload: InputGenerateTransactionPayloadData
  ) => Promise<{ hash: string }>;
}

const WalletCtx = createContext<WalletState>({
  connected: false,
  account: null,
  connect: () => {},
  disconnect: () => {},
  signMessage: async () => ({ signature: "", fullMessage: "" }),
  signAndSubmit: async () => {
    throw new Error("Wallet not connected");
  },
});

export function useWallet() {
  return useContext(WalletCtx);
}

/* ── Adapter → our interface bridge ── */
function WalletBridge({ children }: { children: ReactNode }) {
  const {
    connected,
    account,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    signMessage: adapterSignMessage,
    signAndSubmitTransaction: adapterSignAndSubmit,
  } = useAdapterWallet();

  const ourAccount: WalletAccount | null =
    connected && account
      ? {
          address: account.address.toString(),
          publicKey: account.publicKey?.toString() ?? "",
        }
      : null;

  const ourConnect = useCallback(
    (_addr: string, _pk: string) => {
      // Called by vault after successful connection via ConnectWallet
      // No-op — adapter already tracks the connection
    },
    []
  );

  const ourSignMessage = useCallback(
    async (args: { message: string; nonce: string }) => {
      console.log("[ShelbySafe] signMessage called:", args.message.slice(0, 30));
      // Retry up to 5 times — wallet may need a moment after connect
      let lastError: any;
      for (let i = 0; i < 5; i++) {
        try {
          const result = await adapterSignMessage(args);
          console.log("[ShelbySafe] signMessage OK:", { fullMessage: result?.fullMessage?.slice(0, 30) });
          return {
            signature: (result.signature as any)?.toUint8Array?.() ?? (result.signature as any),
            fullMessage: result.fullMessage,
          };
        } catch (e: any) {
          lastError = e;
          console.warn(`[ShelbySafe] signMessage attempt ${i + 1} failed:`, e?.message);
          if (i < 4) await new Promise((r) => setTimeout(r, 800));
        }
      }
      throw lastError || new Error("signMessage failed after retries");
    },
    [adapterSignMessage]
  );

  const ourSignAndSubmit = useCallback(
    async (payload: InputGenerateTransactionPayloadData) => {
      const result = await adapterSignAndSubmit({ data: payload });
      return { hash: (result as { hash: string }).hash };
    },
    [adapterSignAndSubmit]
  );

  return (
    <WalletCtx.Provider
      value={{
        connected,
        account: ourAccount,
        connect: ourConnect,
        disconnect: adapterDisconnect,
        signMessage: ourSignMessage,
        signAndSubmit: ourSignAndSubmit,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

/* ── Top-level provider ── */
export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: Network.SHELBYNET,
      }}
      onError={(error) => {
        console.error("Wallet adapter error:", error);
      }}
    >
      <WalletBridge>{children}</WalletBridge>
    </AptosWalletAdapterProvider>
  );
}

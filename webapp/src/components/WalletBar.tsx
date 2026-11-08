import React from "react";
import { useWallet } from "../hooks/useWallet";

export function WalletBar() {
  const { wallet, loading, connect } = useWallet();

  if (wallet.connected && wallet.publicKey) {
    const short = `${wallet.publicKey.slice(0, 6)}…${wallet.publicKey.slice(-4)}`;
    return (
      <div className="wallet-bar connected" aria-label="Connected wallet">
        <span className="indicator" aria-hidden="true">●</span>
        <span>{short}</span>
        <span className="network-badge">Testnet</span>
      </div>
    );
  }

  return (
    <div className="wallet-bar">
      {wallet.error && (
        <span className="error" role="alert">{wallet.error}</span>
      )}
      <button
        onClick={connect}
        disabled={loading}
        aria-label="Connect Freighter wallet"
      >
        {loading ? "Connecting…" : "Connect Wallet"}
      </button>
    </div>
  );
}

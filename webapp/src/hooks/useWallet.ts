import { useState, useCallback } from "react";
import { checkFreighter, connectWallet, type WalletState } from "../lib/wallet";

const INITIAL: WalletState = { connected: false, publicKey: null, error: null };

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(INITIAL);
  const [loading, setLoading] = useState(false);

  const connect = useCallback(async () => {
    setLoading(true);
    const state = await connectWallet();
    setWallet(state);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const state = await checkFreighter();
    setWallet(state);
  }, []);

  return { wallet, loading, connect, refresh };
}

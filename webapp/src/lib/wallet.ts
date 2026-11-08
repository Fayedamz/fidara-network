// ---------------------------------------------------------------------------
// Wallet integration via @stellar/freighter-api.
//
// Freighter is a browser extension wallet for Stellar. The app never touches
// secret keys — all signing is delegated to the extension.
// ---------------------------------------------------------------------------

import {
  isConnected,
  getPublicKey,
  signTransaction,
  setAllowed,
} from "@stellar/freighter-api";

export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  error: string | null;
}

/**
 * Check if Freighter is installed and the site is allowed.
 */
export async function checkFreighter(): Promise<WalletState> {
  try {
    const connected = await isConnected();
    if (!connected) {
      return { connected: false, publicKey: null, error: "Freighter extension not found." };
    }
    try {
      const publicKey = await getPublicKey();
      return { connected: true, publicKey, error: null };
    } catch {
      return { connected: false, publicKey: null, error: "Wallet locked or no account selected." };
    }
  } catch (e) {
    return { connected: false, publicKey: null, error: String(e) };
  }
}

/**
 * Request permission for this site then return the user's public key.
 * The app never receives or stores the secret key.
 */
export async function connectWallet(): Promise<WalletState> {
  try {
    await setAllowed();
    return checkFreighter();
  } catch (e) {
    return { connected: false, publicKey: null, error: String(e) };
  }
}

/**
 * Sign a Stellar XDR transaction envelope. Returns the signed XDR.
 * Signing happens entirely inside the Freighter extension.
 *
 * @param xdr     - Base64-encoded transaction XDR.
 * @param network - Network passphrase (testnet by default).
 */
export async function signXdr(
  xdr: string,
  network = "Test SDF Network ; September 2015"
): Promise<string> {
  const signedXdr = await signTransaction(xdr, { networkPassphrase: network });
  if (typeof signedXdr !== "string") {
    throw new Error("Unexpected response from Freighter signTransaction");
  }
  return signedXdr;
}

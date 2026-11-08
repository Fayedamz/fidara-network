// ---------------------------------------------------------------------------
// Wallet integration via @stellar/freighter-api.
//
// Freighter is a browser extension wallet for Stellar. The app never touches
// secret keys — all signing is delegated to the extension.
// ---------------------------------------------------------------------------

import {
  isConnected,
  getAddress,
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
    const result = await isConnected();
    if (!result.isConnected) {
      return { connected: false, publicKey: null, error: "Freighter extension not found." };
    }
    const addressResult = await getAddress();
    if (addressResult.error) {
      return { connected: false, publicKey: null, error: addressResult.error };
    }
    return {
      connected: true,
      publicKey: addressResult.address ?? null,
      error: null,
    };
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
  const result = await signTransaction(xdr, { networkPassphrase: network });
  if (result.error) throw new Error(result.error);
  return result.signedTxXdr;
}

import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';

/**
 * Solana uses BIP44 with coin type 501 and Ed25519 key derivation
 * Standard derivation path: m/44'/501'/account'/change'
 */
const SOLANA_COIN_TYPE = 501;

/**
 * Derive a Solana keypair from a mnemonic phrase using Ed25519 derivation
 * Uses BIP44 path: m/44'/501'/account'/change' (default change=0)
 * This is compatible with most Solana wallets when change=0
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param accountIndex - Account index (default: 0)
 * @param change - Change index (default: 0)
 * @returns Solana Keypair
 */
export function deriveKeypairFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0,
  change: number = 0
): Keypair {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Convert mnemonic to seed (64 bytes)
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  // Derive the path: m/44'/501'/account'/change'
  const path = `m/44'/${SOLANA_COIN_TYPE}'/${accountIndex}'/${change}'`;

  // Derive the Ed25519 key using ed25519-hd-key
  const derivedSeed = derivePath(path, seed.toString('hex')).key;

  // Create Solana keypair from the derived seed using tweetnacl
  const keyPair = nacl.sign.keyPair.fromSeed(derivedSeed);

  // Create Solana Keypair from the nacl keypair
  return new Keypair(keyPair);
}

/**
 * Get Solana address from keypair
 * @param keypair - Solana Keypair
 * @returns Base58 encoded public key (address)
 */
export function getAddressFromKeypair(keypair: Keypair): string {
  return keypair.publicKey.toBase58();
}

/**
 * Derive a Solana address directly from mnemonic
 * @param mnemonic - BIP39 mnemonic phrase
 * @param accountIndex - Account index (default: 0)
 * @returns Solana address (base58 encoded)
 */
export function deriveAddressFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0
): string {
  const keypair = deriveKeypairFromMnemonic(mnemonic, accountIndex);
  return getAddressFromKeypair(keypair);
}

import { Psbt } from 'bitcoinjs-lib';

import { WalletNetwork } from '../types';

import { SatsConnector } from './base';

const getLibNetwork = (network: Network): WalletNetwork => {
  switch (network) {
    case 'livenet':
      return 'mainnet';
    case 'testnet':
      return 'testnet';
  }
};

const getBitgetNetwork = (network: WalletNetwork): Network => {
  switch (network) {
    default:
    case 'mainnet':
      return 'livenet';
    case 'testnet':
      return 'testnet';
  }
};

type AccountsChangedEvent = (event: 'accountsChanged', handler: (accounts: Array<string>) => void) => void;

type Inscription = {
  inscriptionId: string;
  inscriptionNumber: string;
  address: string;
  outputValue: string;
  content: string;
  contentLength: string;
  contentType: string;
  preview: string;
  timestamp: number;
  offset: number;
  genesisTransaction: string;
  location: string;
};

type getInscriptionsResult = { total: number; list: Inscription[] };

type SendInscriptionsResult = { txid: string };

type Balance = { confirmed: number; unconfirmed: number; total: number };

type Network = 'livenet' | 'testnet';

type Bitget = {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
  on: AccountsChangedEvent;
  removeListener: AccountsChangedEvent;
  getInscriptions: (cursor: number, size: number) => Promise<getInscriptionsResult>;
  sendInscription: (
    address: string,
    inscriptionId: string,
    options?: { feeRate: number }
  ) => Promise<SendInscriptionsResult>;
  switchNetwork: (network: 'livenet' | 'testnet') => Promise<void>;
  getNetwork: () => Promise<Network>;
  getPublicKey: () => Promise<string>;
  getBalance: () => Promise<Balance>;
  signMessage: (message: string) => Promise<string>;
  sendBitcoin: (address: string, atomicAmount: number, options?: { feeRate: number }) => Promise<string>;
  signPsbt: (
    psbtHex: string,
    options?: {
      autoFinalized?: boolean;
      toSignInputs: {
        index: number;
        address?: string;
        publicKey?: string;
        sighashTypes?: number[];
        disableTweakSigner?: boolean;
      }[];
    }
  ) => Promise<string>;
};

declare global {
  interface Window {
    bitkeep: {
      unisat: Bitget;
    };
  }
}

class BitgetConnector extends SatsConnector {
  id = 'bitget';
  name = 'Bitget';
  homepage = 'https://web3.bitget.com/';

  constructor(network: WalletNetwork) {
    super(network);
  }

  async connect(): Promise<void> {
    const network = await window.bitkeep.unisat.getNetwork();
    const mappedNetwork = getLibNetwork(network);

    if (mappedNetwork !== this.network) {
      const expectedNetwork = getBitgetNetwork(this.network);

      await window.bitkeep.unisat.switchNetwork(expectedNetwork);
    }

    const [accounts, publickKey] = await Promise.all([
      window.bitkeep.unisat.requestAccounts(),
      window.bitkeep.unisat.getPublicKey()
    ]);

    this.address = accounts[0];
    this.publicKey = publickKey;

    window.bitkeep.unisat.on('accountsChanged', this.changeAccount);
  }

  disconnect() {
    this.address = undefined;
    this.publicKey = undefined;

    window.bitkeep.unisat.removeListener('accountsChanged', this.changeAccount);
  }

  async changeAccount([account]: string[]) {
    this.address = account;
    this.publicKey = await window.bitkeep.unisat.getPublicKey();
  }

  async isReady() {
    this.ready = typeof window.bitkeep.unisat !== 'undefined';

    return this.ready;
  }

  async signMessage(message: string) {
    return window.bitkeep.unisat.signMessage(message);
  }

  async sendToAddress(toAddress: string, amount: number): Promise<string> {
    return window.bitkeep.unisat.sendBitcoin(toAddress, amount);
  }

  async signInput(inputIndex: number, psbt: Psbt) {
    const publicKey = await this.getPublicKey();

    const psbtHex = await window.bitkeep.unisat.signPsbt(psbt.toHex(), {
      autoFinalized: false,
      toSignInputs: [
        {
          index: inputIndex,
          publicKey,
          disableTweakSigner: true
        }
      ]
    });

    return Psbt.fromHex(psbtHex);
  }

  async sendInscription(address: string, inscriptionId: string, feeRate?: number) {
    return (await window.bitkeep.unisat.sendInscription(address, inscriptionId, feeRate ? { feeRate } : undefined))
      .txid;
  }
}

export { BitgetConnector };

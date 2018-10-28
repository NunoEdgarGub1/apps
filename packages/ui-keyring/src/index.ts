// Copyright 2017-2018 @polkadot/ui-keyring authors & contributors
// This software may be modified and distributed under the terms
// of the ISC license. See the LICENSE file for details.

import { KeyringPair, KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import { SingleAddress } from './observable/types';
import { KeyringAddress, KeyringInstance, KeyringJson, KeyringJson$Meta, State } from './types';

import store from 'store';
import testKeyring from '@polkadot/keyring/testing';
import createPair from '@polkadot/keyring/pair';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex, isString } from '@polkadot/util';

import keyringObservable from './observable';
import { accountKey, addressKey, accountRegex, addressRegex, MAX_PASS_LEN } from './defaults';
import keyringOption from './options';

// FIXME The quicker we get in https://github.com/polkadot-js/apps/issues/138
// the better, this is now completely out of control
class Keyring implements KeyringInstance {
  private state: State;

  constructor () {
    // state must be always defined in the constructor even if trying to create second instance to overcome TSLint error
    this.state = {
      accounts: keyringObservable.accounts(),
      addresses: keyringObservable.addresses(),
      keyring: testKeyring()
    };

    // NOTE Everything is loaded in API after chain is received
    // this.loadAll();
  }

  private addAccountPairs (): void {
    const { accounts, keyring } = this.state;

    keyring
      .getPairs()
      .forEach((pair: KeyringPair) => {
        const address = pair.address();

        accounts.add(address, {
          address,
          meta: pair.getMeta()
        });
      });
  }

  addAccountPair (pair: KeyringPair, password: string): KeyringPair {
    const { keyring } = this.state;

    keyring.addPair(pair);

    this.saveAccount(pair, password);

    return pair;
  }

  backupAccount (pair: KeyringPair, password: string): KeyringPair$Json {
    if (!pair.isLocked()) {
      pair.lock();
    }

    pair.decodePkcs8(password);

    return pair.toJson(password);
  }

  createAccount (seed: Uint8Array, password?: string, meta: KeyringPair$Meta = {}): KeyringPair {
    const { keyring } = this.state;

    const pair = keyring.addFromSeed(seed, meta);

    this.saveAccount(pair, password);

    return pair;
  }

  createAccountMnemonic (seed: string, password?: string, meta: KeyringPair$Meta = {}): KeyringPair {
    const { keyring } = this.state;

    const pair = keyring.addFromMnemonic(seed, meta);

    this.saveAccount(pair, password);

    return pair;
  }

  encryptAccount (pair: KeyringPair, password: string): void {
    const { accounts, keyring } = this.state;
    const json = pair.toJson(password);

    json.meta.whenEdited = Date.now();

    keyring.addFromJson(json);
    accounts.add(json.address, json);
  }

  forgetAccount (address: string): void {
    const { accounts, keyring } = this.state;

    keyring.removePair(address);
    accounts.remove(address);
  }

  forgetAddress (address: string): void {
    this.state.addresses.remove(address);
  }

  getAccounts (): Array<KeyringAddress> {
    const { accounts } = this.state;
    const available = accounts.subject.getValue();

    return Object
      .keys(available)
      .map((address) =>
        this.getAddress(address, 'account')
      )
      .filter((account) =>
        !account.getMeta().isTesting
      );
  }

  getAddress (_address: string | Uint8Array, type: 'account' | 'address' = 'address'): KeyringAddress {
    const { accounts, addresses } = this.state;
    const address = isString(_address)
      ? _address
      : encodeAddress(_address);
    const publicKey = decodeAddress(address);
    const subject = type === 'account'
      ? accounts.subject
      : addresses.subject;

    return {
      address: (): string =>
        address,
      isValid: (): boolean =>
        !!subject.getValue()[address],
      publicKey: (): Uint8Array =>
        publicKey,
      getMeta: (): KeyringJson$Meta =>
        subject.getValue()[address].json.meta
    };
  }

  getAddresses (): Array<KeyringAddress> {
    const { addresses } = this.state;
    const available = addresses.subject.getValue();

    return Object
      .keys(available)
      .map((address) =>
        this.getAddress(address)
      );
  }

  getPair (address: string | Uint8Array): KeyringPair {
    return this.state.keyring.getPair(address);
  }

  getPairs (): Array<KeyringPair> {
    return this.state.keyring.getPairs().filter((pair: KeyringPair) =>
      keyringObservable.isDevelopment() || pair.getMeta().isTesting !== true
    );
  }

  isAvailable (_address: Uint8Array | string): boolean {
    const { accounts, addresses } = this.state;
    const accountsValue = accounts.subject.getValue();
    const addressesValue = addresses.subject.getValue();
    const address = isString(_address)
      ? _address
      : encodeAddress(_address);

    return !accountsValue[address] && !addressesValue[address];
  }

  isPassValid (password: string): boolean {
    return password.length > 0 && password.length <= MAX_PASS_LEN;
  }

  loadAll (): void {
    const { accounts, addresses, keyring } = this.state;

    this.addAccountPairs();

    store.each((json: KeyringJson, key: string) => {
      if (accountRegex.test(key)) {
        if (!json.meta.isTesting && (json as KeyringPair$Json).encoded) {
          const pair = keyring.addFromJson(json as KeyringPair$Json);

          accounts.add(pair.address(), json);
        }

        const [, hexAddr] = key.split(':');

        if (hexAddr.substr(0, 2) !== '0x') {
          store.remove(key);
          store.set(accountKey(hexAddr), json);
        }
      } else if (addressRegex.test(key)) {
        const address = encodeAddress(
          isHex(json.address)
            ? hexToU8a(json.address)
            : decodeAddress(json.address)
        );
        const [, hexAddr] = key.split(':');

        addresses.add(address, json);

        if (hexAddr.substr(0, 2) !== '0x') {
          store.remove(key);
          store.set(addressKey(hexAddr), json);
        }
      }
    });

    keyringOption.initOptions(this.state);
  }

  restoreAccount (json: KeyringPair$Json, password: string): KeyringPair {
    const pair = createPair(
      {
        publicKey: decodeAddress(json.address),
        secretKey: new Uint8Array()
      },
      json.meta,
      hexToU8a(json.encoded)
    );

    // unlock, save account and then lock (locking cleans secretKey, so needs to be last)
    pair.decodePkcs8(password);
    this.addAccountPair(pair, password);
    pair.lock();

    return pair;
  }

  saveAccount (pair: KeyringPair, password?: string): void {
    const { accounts, keyring } = this.state;
    const json = pair.toJson(password);

    if (!json.meta.whenCreated) {
      json.meta.whenCreated = Date.now();
    }

    keyring.addFromJson(json);
    accounts.add(json.address, json);
  }

  saveAccountMeta (pair: KeyringPair, meta: KeyringPair$Meta): void {
    const { accounts } = this.state;
    const address = pair.address();
    const json = store.get(accountKey(address));

    pair.setMeta(meta);
    json.meta = pair.getMeta();

    accounts.add(json.address, json);
  }

  saveAddress (address: string, meta: KeyringPair$Meta): void {
    const { addresses } = this.state;
    const available = addresses.subject.getValue();

    const json = (available[address] && available[address].json) || {
      address,
      meta: {
        isRecent: void 0,
        whenCreated: Date.now()
      }
    };

    Object.keys(meta).forEach((key) => {
      json.meta[key] = meta[key];
    });

    delete json.meta.isRecent;

    addresses.add(address, json);
  }

  saveRecent (address: string): SingleAddress {
    const { addresses } = this.state;
    const available = addresses.subject.getValue();

    if (!available[address]) {
      const json = {
        address,
        meta: {
          isRecent: true,
          whenCreated: Date.now()
        }
      };

      addresses.add(address, (json as KeyringJson));
    }

    return addresses.subject.getValue()[address];
  }

  setDevMode (isDevelopment: boolean): void {
    keyringObservable.set(isDevelopment);
  }
}

const keyringInstance = new Keyring();

export default keyringInstance;

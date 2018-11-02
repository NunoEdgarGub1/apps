// Copyright 2017-2018 @polkadot/ui-keyring authors & contributors
// This software may be modified and distributed under the terms
// of the ISC license. See the LICENSE file for details.

import { BehaviorSubject, Observable } from 'rxjs';
import { KeyringSectionOption } from '../options/types';
import { KeyringJson } from '../types';

export type SingleAccount = {
  json: KeyringJson,
  option: KeyringSectionOption
}

export type SingleAddress = {
  json: KeyringJson,
  option: KeyringSectionOption
}

export type SubjectInfo = {
  [index: string]: SingleAddress
};

export type AccountSubject = {
  add: (account: string, json: KeyringJson) => SingleAccount,
  remove: (account: string) => void,
  subject: BehaviorSubject<SubjectInfo>
};

export type AddressSubject = {
  add: (address: string, json: KeyringJson) => SingleAddress,
  remove: (address: string) => void,
  subject: BehaviorSubject<SubjectInfo>
};

export interface KeyringObservableInstance {
  readonly all: Observable<any>,
  readonly accounts: AccountSubject,
  readonly addresses: AddressSubject,
  readonly isDevelopment: boolean

  observableAll: () => Observable<any>,
  setDevMode: (isDevelopment: boolean) => void
}

'use client';

import {useEffect, useRef, useState} from 'react';
import {client} from './AuthPanel';
import {
  decodeAccountShortlist,
  type SavedGuideAction, type SavedGuideIdentity, type SavedGuideStatus,
} from '@/lib/saved-guides';

type Account = {id: string; requests: AbortController};
type ActiveSession = {account: Account; token: string};
type Snapshot = {account: Account; items: SavedGuideIdentity[] | null};

async function request(session: ActiveSession, action: SavedGuideAction, guides: SavedGuideIdentity[] = []) {
  if (!client) throw new Error('Sign-in unavailable');
  // Carry the token belonging to the account that initiated the action.
  const {data, error} = await client.rpc('rmg_account_saved_guides_v1', {p_action: action, p_guides: guides})
    .setHeader('Authorization', `Bearer ${session.token}`).abortSignal(session.account.requests.signal);
  if (error) throw error;
  return decodeAccountShortlist(data, action);
}

export default function useAccountSavedGuides() {
  const active = useRef<ActiveSession | null>(null);
  const busy = useRef<Account | null>(null);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<Account | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!client) { setAccount(null); return; }
    const {data: {subscription}} = client.auth.onAuthStateChange((_event, session) => {
      const id = session && !session.user.is_anonymous ? session.user.id : null;
      if (id && session && active.current?.account.id === id) {
        active.current.token = session.access_token;
        return;
      }
      active.current?.account.requests.abort();
      const next = id && session ? {id, requests: new AbortController()} : null;
      active.current = next && session ? {account: next, token: session.access_token} : null;
      setSnapshot(null);
      setPending(null);
      setAccount(next);
    });
    return () => {
      subscription.unsubscribe();
      active.current?.account.requests.abort();
      active.current = null;
    };
  }, []);

  useEffect(() => {
    const session = active.current;
    if (!account || session?.account !== account) return;
    let cancelled = false;
    void request(session, 'list').then(result => {
      if (!cancelled && active.current?.account === account) setSnapshot({account, items: result.items});
    }).catch(() => {
      if (!cancelled && active.current?.account === account) setSnapshot({account, items: null});
    });
    return () => { cancelled = true; };
  }, [account, revision]);

  const items = snapshot && snapshot.account === account ? snapshot.items : undefined;
  function retry() {
    if (!account || active.current?.account !== account || busy.current === account) return;
    setSnapshot(null);
    setRevision(value => value + 1);
  }

  async function change(action: Exclude<SavedGuideAction, 'list'>, guides: SavedGuideIdentity[]): Promise<SavedGuideStatus | 'unavailable' | 'cancelled'> {
    const session = active.current;
    if (!account || session?.account !== account || !items || busy.current === account) return 'cancelled';
    busy.current = account;
    setPending(account);
    try {
      const result = await request(session, action, guides);
      if (active.current?.account !== account) return 'cancelled';
      setSnapshot({account, items: result.items});
      return result.status;
    } catch {
      return active.current?.account === account ? 'unavailable' : 'cancelled';
    } finally {
      if (busy.current === account) {
        busy.current = null;
        setPending(value => value === account ? null : value);
      }
    }
  }

  return {account, items, pending: !!account && pending === account, change, retry};
}

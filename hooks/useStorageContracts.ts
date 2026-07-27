import { useCallback, useMemo, useRef, useState } from 'react';
import { UploadFile, useAppStore } from '@/store/useAppStore';
import { fetchContractsPage } from '@/lib/ton/transactions';
import { getDescriptions } from '@/lib/api';
import { getProvidersStorageChecks } from '@/lib/thirdparty';
import { BagInfoShort } from '@/lib/types';
import { ContractStatus, ContractStatuses } from '@/types/mytonstorage';

export type UseStorageContractsOptions = {
  address?: string | null;
  pageSize: number;
  maxAutoPages: number;
};

export function useStorageContracts({
  address,
  pageSize,
  maxAutoPages,
}: UseStorageContractsOptions) {
  const { files, setFiles, setBlockchain } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [isCheckingNewer, setIsCheckingNewer] = useState(false);
  const cursorRef = useRef<string | undefined>(files.blockchain.lt);
  const seen = useRef<Set<string>>(new Set(files.list.map(f => f.status + ":" + f.contractAddress)));
  const reqId = useRef(0);
  const newerReqId = useRef(0);

  // simple caches to avoid re-fetching enrichments across pages
  const descCache = useRef<Map<string, BagInfoShort>>(new Map());
  const checksCache = useRef<Map<string, ContractStatus[]>>(new Map());

  const items = files.list;
  const cursor = cursorRef.current;

  const enrich = useCallback(async (addresses: string[], current: UploadFile[]): Promise<UploadFile[]> => {
    const missingDesc = addresses.filter(a => !descCache.current.has(a));
    if (missingDesc.length > 0) {
      const desc = await getDescriptions(missingDesc);
      if (desc.data) {
        (desc.data as BagInfoShort[]).forEach(d => descCache.current.set(d.contract_address, d));
      }
    }
    const missingChecks = addresses.filter(a => !checksCache.current.has(a));
    if (missingChecks.length > 0) {
      const resp = await getProvidersStorageChecks(missingChecks);
      const checks = resp.data as ContractStatuses | undefined;
      if (checks?.contracts) {
        const byAddress = new Map<string, ContractStatus[]>();
        checks.contracts.forEach(c => {
          const list = byAddress.get(c.address) || [];
          list.push(c);
          byAddress.set(c.address, list);
        });
        byAddress.forEach((list, addr) => {
          checksCache.current.set(addr, list);
        });
      }
    }

    return current.map(f => ({
      ...f,
      info: descCache.current.get(f.contractAddress) || null,
      contractChecks: checksCache.current.get(f.contractAddress) || [],
    }));
  }, []);

  const fetchAndMaybeAdvance = useCallback(async () => {
    if (isLoading || !address || reachedEnd) return;
    setIsLoading(true);
    setError(null);
    reqId.current += 1;
    const myReq = reqId.current;

    let pageCursor = cursorRef.current;
    let aggregated: UploadFile[] = [];
    let pagesTried = 0;
    let localReachedEnd = false;

    while (true) {
      const page = await fetchContractsPage(address, pageCursor, pageSize);
      if (reqId.current !== myReq) return; // cancelled by a later call

      if (page instanceof Error) {
        setError(page.message);
        break;
      }

      const { items: contracts, nextLt, reachedEnd: end } = page;
      pageCursor = nextLt;
      localReachedEnd = end;

      // normalize & dedup
      const fresh: UploadFile[] = contracts
        .map(c => ({
          contractAddress: c.address,
          updatedAt: c.createdAt,
          expiresAt: null,
          info: null,
          contractChecks: [],
          contractInfo: null,
          lastContractUpdate: null,
          status: 'uploaded' as const,
        }))
        .filter(f => !seen.current.has(f.status + ":" + f.contractAddress));

      fresh.forEach(f => seen.current.add(f.status + ":" + f.contractAddress));

      // if we found something — enrich and stop auto-advance
      if (fresh.length > 0) {
        const addresses = fresh.map(f => f.contractAddress);
        const enriched = await enrich(addresses, fresh);
        aggregated = aggregated.concat(enriched);
        break;
      }

      pagesTried += 1;
      if (localReachedEnd || pagesTried >= maxAutoPages) {
        break;
      }

      await new Promise(r => setTimeout(r, 1100));
    }

    if (reqId.current === myReq) {
      cursorRef.current = pageCursor;
      setBlockchain(pageCursor || '0', Date.now());
      if (aggregated.length > 0) {
        setFiles(items.concat(aggregated));
      }
      setReachedEnd(localReachedEnd || (pageCursor === '0'));
      setIsLoading(false);
    }
  }, [address, enrich, isLoading, items, maxAutoPages, pageSize, reachedEnd, setBlockchain, setFiles]);

  const loadNewer = useCallback(async () => {
    if (isCheckingNewer || !address) return;
    setIsCheckingNewer(true);
    reqId.current += 1;
    newerReqId.current = reqId.current;
    const myReq = newerReqId.current;

    const oldHeadLt = useAppStore.getState().files.blockchain.headLt;
    let pageCursor: string | undefined = undefined;
    let pagesTried = 0;
    let aggregated: UploadFile[] = [];
    let newHeadLt = oldHeadLt;

    while (true) {
      const page = await fetchContractsPage(address, pageCursor, pageSize);
      if (newerReqId.current !== myReq) return;
      if (page instanceof Error) {
        setError(page.message);
        break;
      }

      const { items: contracts, nextLt, pageMaxLt, pageMinLt, reachedEnd: end } = page;
      pageCursor = nextLt;

      // Update head candidate
      if (!newHeadLt || BigInt(pageMaxLt) > BigInt(newHeadLt)) newHeadLt = pageMaxLt;

      const fresh: UploadFile[] = contracts
        .map(c => ({
          contractAddress: c.address,
          updatedAt: c.createdAt,
          expiresAt: null,
          info: null,
          contractChecks: [],
          contractInfo: null,
          lastContractUpdate: null,
          status: c.opcode === "0x61fff683" ? 'closed' as const : 'uploaded' as const,
        }))
        .filter(f => !seen.current.has(f.status + ":" + f.contractAddress));
      fresh.forEach(f => seen.current.add(f.status + ":" + f.contractAddress));
      if (fresh.length > 0) {
        const addresses = fresh.map(f => f.contractAddress);
        const enriched = await enrich(addresses, fresh);
        aggregated = enriched.concat(aggregated);
      }

      // Continue until we cross oldHeadLt; if no oldHeadLt yet, keep a small page limit to avoid long initial scans
      pagesTried += 1;
      if (end
        || (oldHeadLt && BigInt(pageMinLt) <= BigInt(oldHeadLt))
        || (!oldHeadLt && pagesTried >= 3)) {
        break;
      }
      await new Promise(r => setTimeout(r, 1100));
    }

    // commit: merge fresh, then refresh statuses for all non-closed known contracts
    if (newerReqId.current === myReq) {
      const nextList = aggregated.length > 0 ? aggregated.concat(items) : items;
      const toRefresh = nextList.filter(f => f.status !== 'closed');

      let finalList = nextList;
      if (toRefresh.length > 0) {
        // Bust cache only for previously known entries (fresh were just enriched in the scan loop)
        const previouslyKnown = new Set(items.map(f => f.contractAddress));
        toRefresh.forEach(f => {
          if (previouslyKnown.has(f.contractAddress)) {
            checksCache.current.delete(f.contractAddress);
          }
        });
        const refreshed = await enrich(
          toRefresh.map(f => f.contractAddress),
          toRefresh,
        );
        if (newerReqId.current !== myReq) return;
        const byAddress = new Map(refreshed.map(f => [f.contractAddress, f]));
        finalList = nextList.map(f => byAddress.get(f.contractAddress) || f);
      }

      if (aggregated.length > 0 || toRefresh.length > 0) {
        setFiles(finalList);
      }
      if (newHeadLt) {
        useAppStore.getState().setHeadLt(newHeadLt);
      }
      setIsCheckingNewer(false);
    }
  }, [address, enrich, isCheckingNewer, items, pageSize, setFiles]);

  return useMemo(() => ({
    items,
    loadMore: fetchAndMaybeAdvance,
    loadNewer,
    isLoading,
    isCheckingNewer,
    error,
    cursor,
    reachedEnd,
  }), [cursor, error, fetchAndMaybeAdvance, isLoading, items, reachedEnd, loadNewer, isCheckingNewer]);
}

"use client"

import React, { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { safeDisconnect } from '@/lib/ton/safeDisconnect';
import { getTopupBalanceTransaction, getWithdrawTransaction } from '@/lib/api';
import { sendTransactionWithFallback } from '@/lib/ton/transactions';
import { Transaction } from '@/lib/types';
import { Copy, ReceiptText } from 'lucide-react';
import { copyToClipboard, shortenString } from '@/lib/utils';
import { ContractDetails } from '@/components/contract-details';
import { TopupDetails } from '@/components/topup-details';
import { UnpaidFilesList } from './unpaid-list';
import { ErrorComponent } from '@/components/error';
import { ContractStatus } from '@/types/mytonstorage';
import { useIsMobile } from '@/hooks/useIsMobile';
import { StorageContractsMobile } from './storage-contracts-mobile';
import { StorageContractsDesktop } from './storage-contracts-desktop';
import { useStorageContracts } from '@/hooks/useStorageContracts';
import { useTranslation } from "react-i18next";

export function FilesList() {
  const { t } = useTranslation();
  const apiBase = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || "https://mytonstorage.org";
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [error, setError] = useState<string | null>(null);
  const { files, setFiles, setHideClosed } = useAppStore();
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const [selectedTopupContract, setSelectedTopupContract] = useState<string | null>(null);
  const [loadingWithdrawalAddress, setLoadingWithdrawalAddress] = useState<string | null>(null);
  const [loadingTopupAddress, setLoadingTopupAddress] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const hideClosed = files.hideClosed;
  const isMobile = useIsMobile();

  const {
    items: pagedItems,
    loadMore,
    loadNewer,
    isLoading: hookLoading,
    isCheckingNewer,
    error: hookError,
    reachedEnd,
  } = useStorageContracts({ address: wallet?.account.address, pageSize: 100, maxAutoPages: 10 });

  useEffect(() => {
    const fetchData = async () => {
      if (wallet?.account.address) {
        await loadNewer();
        setLastUpdate(Date.now());
      }
    };
    fetchData();
  }, [wallet?.account.address]);

  // Handle Esc key to close modals
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedContract !== null) {
          setSelectedContract(null);
        } else if (selectedTopupContract !== null) {
          setSelectedTopupContract(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedContract, selectedTopupContract]);


  const topupBalance = async (storageContractAddress: string, amount?: number) => {
    if (!amount) {
      // Open modal to input amount
      setSelectedTopupContract(storageContractAddress);
      return;
    }

    if (loadingWithdrawalAddress || isLoading) {
      return;
    }

    setLoadingTopupAddress(storageContractAddress);
    setError(null);

    const resp = await getTopupBalanceTransaction({ address: storageContractAddress, amount });
    if (resp.status === 401) {
      setError(t('errors.unauthorizedLoggingOut'));
      console.error('getTopupBalanceTransaction unauthorized. Logging out.');
      safeDisconnect(tonConnectUI);
      setLoadingTopupAddress(null);
      return;
    }
    if (resp.error) {
      setLoadingTopupAddress(null);
      setError(resp.error);
      return;
    }

    const tx = resp.data as Transaction;

    const message = {
      address: tx.address,
      amount: tx.amount.toString(),
    };

    setLoadingTopupAddress(null);
    setSelectedTopupContract(null);

    console.log("Sending topup transaction:", message);
    if (!wallet?.account.address) {
      setError(t('errors.unknownErrorOccurred'));
    } else {
      const result = await sendTransactionWithFallback({
        tonConnectUI,
        message,
        contractAddress: tx.address,
        userAddress: wallet.account.address,
        timeoutMs: 180_000,
        pollingIntervalMs: 5_000,
      });

      console.log("Topup transaction result:", result);
      if (!result.success) {
        setError(t('errors.failedToSendTransactionShort'));
      }
    }
  }

  const cancelStorage = async (storageContractAddress: string) => {
    if (loadingWithdrawalAddress || isLoading) {
      return;
    }

    setLoadingWithdrawalAddress(storageContractAddress);
    setError(null);
    setIsLoading(false);

    const resp = await getWithdrawTransaction(storageContractAddress);
    if (resp.status === 401) {
      setError(t('errors.unauthorizedLoggingOut'));
      console.error('getWithdrawTransaction unauthorized. Logging out.');
      safeDisconnect(tonConnectUI);
      setLoadingWithdrawalAddress(null);
      return;
    }
    if (resp.error) {
      setLoadingWithdrawalAddress(null);
      setError(resp.error);
      return;
    }

    const tx = resp.data as Transaction;

    const message = {
      address: tx.address,
      amount: tx.amount.toString(),
      payload: tx.body,
    };

    setLoadingWithdrawalAddress(null);

    console.log("Sending transaction:", message);
    if (!wallet?.account.address) {
      setError(t('errors.unknownErrorOccurred'));
      setLoadingWithdrawalAddress(null);
      return;
    }

    const result = await sendTransactionWithFallback({
      tonConnectUI,
      message,
      contractAddress: tx.address,
      userAddress: wallet.account.address,
      timeoutMs: 180_000,
      pollingIntervalMs: 5_000,
    });

    console.log("Transaction result:", result);

    if (result.success) {
      const filtered = files.list.filter(f => f.contractAddress !== tx.address);
      setFiles(filtered);
    } else {
      console.error("Cancel storage transaction failed:", result.error);
      setError(t('errors.failedToSendTransactionShort'));
    }
  }

  const buildContractChecksBlock = (checks: ContractStatus[], status: string) => {
    if (status === 'closed') {
      return (
        <div className="flex rounded-lg border border-red-200 bg-red-50 w-14 h-6 items-center justify-center text-xs font-semibold text-gray-600">
          {t('bagsList.contractClosed')}
        </div>
      );
    }

    var valid = (checks || []).filter(c => c.reason === 0).length;
    var total = (checks || []).length;

    // Определяем цвета на основе статуса
    var validColor, textColor;

    if (total === 0) {
      validColor = 'bg-gray-100';
      textColor = 'text-gray-600';
    } else if (valid === total) {
      validColor = 'bg-green-100 border border-green-200';
      textColor = 'text-green-700';
    } else if (valid > total / 2) {
      validColor = 'bg-yellow-100 border border-yellow-200';
      textColor = 'text-yellow-700';
    } else {
      validColor = 'bg-red-100 border border-red-200';
      textColor = 'text-red-700';
    }

    return (
      <div>
        {total === 0 ? (
          <span className="ml-2 text-xs text-gray-400 italic">{t('bagsList.noPeers')}</span>
        ) : (
          <div className="flex items-center">
            <div className={`flex rounded-lg ${validColor} w-7 h-6 items-center justify-center text-xs font-semibold ${textColor}`}>
              <span>{valid}</span>
            </div>
            <span className='text-gray-400 mx-1 text-xs font-medium'>/</span>
            <div className='flex rounded-lg bg-gray-100 w-7 h-6 items-center justify-center text-xs font-semibold text-gray-600'>
              <span>{total}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      {/* Details modal */}
      {selectedContract !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto pointer-events-none">
          <div className={`relative bg-white border shadow-2xl rounded-xl mt-4 mb-4 mx-auto w-full max-h-[100vh] overflow-y-auto pointer-events-auto ${isMobile ? 'p-4 max-w-none' : 'p-8 max-w-5xl'
            }`}>
            <button
              className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors duration-200"
              onClick={() => setSelectedContract(null)}
            >
              <span className="text-gray-600 text-lg font-medium">✕</span>
            </button>

            {selectedContract && (
              <div>
                <div className="text-gray-700 mb-2">
                  <div className={`flex items-center ${isMobile ? 'flex-col items-start space-y-2' : ''}`}>
                    <span className="text-gray-900 font-semibold">{t('bagsList.storageContractInfo')}</span>
                    <div className={`flex items-center ${isMobile ? '' : 'ml-2'}`}>
                      <a
                        href={`https://tonscan.org/address/${selectedContract}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-all"
                        title={selectedContract}>
                        {shortenString(selectedContract, isMobile ? 24 : 48)}
                      </a>
                      <button
                        onClick={() => copyToClipboard(selectedContract, setCopiedKey)}
                        className={`ml-2 transition-colors duration-200
                            ${copiedKey === selectedContract
                            ? "text-gray-100 font-extrabold drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]"
                            : "text-gray-700 hover:text-gray-400"
                          }`}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <br />
                  <ContractDetails contractAddress={selectedContract} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Topup modal */}
      {selectedTopupContract !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto pointer-events-none">
          <div className={`relative bg-white border shadow-2xl rounded-xl mt-4 mb-4 mx-auto w-full pointer-events-auto ${isMobile ? 'max-w-none' : 'max-w-lg'
            }`}>
            <button
              className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors duration-200"
              onClick={() => setSelectedTopupContract(null)}
            >
              <span className="text-gray-600 text-lg font-medium">✕</span>
            </button>

            <TopupDetails
              onConfirm={(amount) => topupBalance(selectedTopupContract, amount)}
              onCancel={() => setSelectedTopupContract(null)}
              isLoading={loadingTopupAddress === selectedTopupContract}
            />
          </div>
        </div>
      )}

      {/* Unpaid - from backend */}
      <div className="relative z-10">
        <UnpaidFilesList />
        <br />
      </div>

      {/* Paid - from blockchain */}
      <div className={`flex items-center justify-between gap-2 mb-4 ${isMobile ? 'px-1' : ''}`}>
        <div className="flex items-center">
          <ReceiptText className={`text-blue-600 ${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
          <h2 className={`pl-2 font-semibold text-gray-900 ${isMobile ? 'text-base' : 'text-lg'}`}>
            {t('bagsList.storageContracts')}
          </h2>
        </div>
        {
          !isMobile &&
          <div>
            <div className="flex items-center space-x-6">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideClosed}
                  onChange={e => setHideClosed(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">
                  {t('bagsList.hideClosedContracts')}
                </span>
              </label>
              <button
                onClick={() => loadNewer()}
                disabled={true}
                className="px-3 py-1 cursor-default rounded-full text-gray-600 bg-gray-100"
              >
                {isCheckingNewer
                  ? t('bagsList.checking')
                  : lastUpdate && lastUpdate < Date.now() - 1000 * 60 * 10
                    ? t('bagsList.reloadPageToRefresh')
                    : t('bagsList.listUpdated')}
              </button>
            </div>
          </div>
        }
      </div>

      {(hookError || error) && <ErrorComponent error={hookError || error} />}

      {/* Files list */}
      <div className="grid gap-4">
        {pagedItems.length === 0 && (
          <div className={`text-gray-500 text-center py-8 ${isMobile ? 'px-4' : ''}`}>
            <div className="text-gray-300 mb-2">
              <ReceiptText className="w-12 h-12 mx-auto" />
            </div>
            <p className={`font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>
              {t('bagsList.noStorageContractsFound')}
            </p>
            <p className={`text-gray-400 ${isMobile ? 'text-xs mt-1' : 'text-sm mt-2'}`}>
              {t('uploadToStart')}
            </p>
          </div>
        )}

        {pagedItems.length > 0 && (
          <>
            {isMobile ? (
              <StorageContractsMobile
                files={pagedItems}
                copiedKey={copiedKey}
                setCopiedKey={setCopiedKey}
                onSelectContract={setSelectedContract}
                onTopupBalance={topupBalance}
                onCancelStorage={cancelStorage}
                loadingWithdrawalAddress={loadingWithdrawalAddress}
                isLoading={hookLoading}
                hideClosed={hideClosed}
                buildContractChecksBlock={buildContractChecksBlock}
                apiBase={apiBase}
              />
            ) : (
              <StorageContractsDesktop
                files={pagedItems}
                copiedKey={copiedKey}
                setCopiedKey={setCopiedKey}
                onSelectContract={setSelectedContract}
                onTopupBalance={topupBalance}
                onCancelStorage={cancelStorage}
                loadingWithdrawalAddress={loadingWithdrawalAddress}
                isLoading={hookLoading}
                hideClosed={hideClosed}
                buildContractChecksBlock={buildContractChecksBlock}
                apiBase={apiBase}
              />
            )}

            {/* Load more button */}
            {!reachedEnd && (
              <div className='flex justify-center mt-4 mb-8'>
                <button
                  onClick={() => loadMore()}
                  disabled={hookLoading}
                  className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-100"
                >

                  <div className="flex">
                    {hookLoading ? (
                      t('bagsList.lookingForMore')
                    ) : (
                      t('bagsList.loadMore')
                    )}
                  </div>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div >
  )
}

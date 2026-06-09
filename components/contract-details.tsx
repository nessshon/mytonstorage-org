
"use client"

import { UploadFile, useAppStore } from "@/store/useAppStore";
import { ProviderInfo, StorageContractFull } from "@/types/blockchain";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ErrorComponent } from "./error";
import { RenderField } from "./render-field";
import { CircleX, Copy, Info, ListMinus, Loader2, PackageOpen, Pencil, RefreshCcw, Undo2 } from "lucide-react";
import { copyToClipboard, printSpace, secondsToDays, shortenString } from "@/lib/utils";
import { fetchStorageContractFullInfo } from "@/lib/ton/storage-contracts";
import { TextField } from "./input-text-field";
import { getOffers, getUpdateTransaction } from "@/lib/api";
import { Offers } from "@/types/files";
import { Transaction } from "@/lib/types";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { safeDisconnect } from '@/lib/ton/safeDisconnect';
import { sendTransactionWithFallback } from '@/lib/ton/transactions';
import HintWithIcon from "./hint";
import { DAY_SECONDS, FEE_UPDATE, WEEK_DAYS } from "@/lib/storage-constants";
import { PeriodField } from "./input-period-field";

export interface ContractDetailsProps {
    contractAddress: string;
}

type providerEdit = {
    state: "new" | "deleted" | "same",
    provider: ProviderInfo
}

const contractUpdateTimeout = 1000 * 60 * 60;

export function ContractDetails({ contractAddress }: ContractDetailsProps) {
    const { t } = useTranslation();
    const apiBase = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || "https://mytonstorage.org";
    const [tonConnectUI] = useTonConnectUI();
    const { files, setFiles } = useAppStore();
    const [localContractInfo, setLocalContractInfo] = React.useState<StorageContractFull | null>(null);
    const [isLoadingContractInfo, setIsLoadingContractInfo] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [warn, setWarn] = React.useState<string | null>(null);
    const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
    const [newPubkey, setNewPubkey] = React.useState<string | null>(null);

    const wallet = useTonWallet();

    const [isEdit, setIsEdit] = React.useState(false);
    const [editProviders, setEditProviders] = React.useState<providerEdit[] | null>(null);
    const [proofPeriodDays, setProofPeriodDays] = React.useState<number>(WEEK_DAYS);
    const [needOffers, setNeedOffers] = React.useState<boolean>(false);
    const [offersLoading, setOffersLoading] = React.useState<boolean>(false);

    useEffect(() => {
        if (editProviders) {
            const needOffers = editProviders.some(p => {
                return p.state !== "deleted" && (
                    p.provider.maxSpan === 0 ||
                    p.provider.maxSpan !== proofPeriodDays * DAY_SECONDS
                );
            });
            setNeedOffers(needOffers);
        }
    }, [editProviders, proofPeriodDays]);

    useEffect(() => {
        let isCached = false;
        files.list.forEach(file => {
            if (file.contractAddress === contractAddress) {
                if (file.lastContractUpdate && Date.now() - file.lastContractUpdate < contractUpdateTimeout) {
                    setLocalContractInfo(file.contractInfo);
                    setEditProviders(file.contractInfo?.providers.providers.map(provider => ({
                        state: "same",
                        provider
                    })) || null);
                    isCached = true;
                }
            }
        });

        if (isCached) return;

        fetchContractInfo();
    }, [contractAddress]);

    useEffect(() => {
        if (files.list.length === 0 || !localContractInfo) return;

        const updatedFiles = files.list.map(file => {
            if (file.contractAddress === contractAddress) {
                return { ...file, contractInfo: localContractInfo, lastContractUpdate: Date.now() };
            }
            return file;
        });

        const proofs = localContractInfo.providers.providers.reduce((acc, p) => {
            if (p.lastProof) {
                acc += 1;
            }

            return acc;
        }, 0);

        if (localContractInfo.providers.providers.length > 0) {
            if (proofs === 0) {
                setWarn(t('contract.noProofsFromProvidersYet'));
            } else if (proofs < localContractInfo.providers.providers.length) {
                setWarn(t('contract.someProvidersNotSubmittedProofs'));
            }
        } else {
            setWarn(null);
        }

        setFiles(updatedFiles);
    }, [localContractInfo]);

    const computeNextProofTime = (provider: ProviderInfo) => {
        if (localContractInfo === null) return <></>;

        if (provider.lastProof === 0 || provider.maxSpan === 0) return <></>;

        const nextProofTimestamp = provider.lastProof + provider.maxSpan;
        const date = new Date(nextProofTimestamp * 1000).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        const timeLeft = nextProofTimestamp - Math.floor(Date.now() / 1000);
        const totalSpan = provider.maxSpan;
        let colorClass = "text-green-600";

        if (timeLeft < 0) {
            colorClass = "text-red-600"; // expired
        } else if (timeLeft < totalSpan / 10) {
            colorClass = "text-yellow-600"; // warning
        }

        return <span className={colorClass}>{date}</span>;
    }

    const computeStorageProofStatus = (bagID: string, providerCID: string, files: UploadFile[]) => {
        const file = files.find(f => f.info?.bag_id.toLowerCase() === bagID.toLowerCase());
        if (!file) return <span className="text-gray-500">{t('status.na')}</span>;

        const proof = (file.contractChecks || []).find(c => c.provider_pubkey.toLowerCase() === providerCID.toLowerCase());
        if (!proof) return <span className="text-gray-500">{t('status.na')}</span>;

        if (proof.reason === 0) {
            return <span>{t('status.ok')}</span>;
        } else if (proof.reason === null) {
            return <span className="text-gray-500">N/A</span>;
        }
            return <span className="text-red-600">{t('status.no')}</span>;
    }

    const fetchContractInfo = async () => {
        if (isLoadingContractInfo) return;

        setIsLoadingContractInfo(true);
        setError(null);

        const info = await fetchStorageContractFullInfo(contractAddress);
        if (info instanceof Error) {
            setIsLoadingContractInfo(false);
            setError(info.message);
            return;
        }

        console.log("Fetched contract info:", info);
        setIsLoadingContractInfo(false);
        setLocalContractInfo(info);
        setEditProviders(info.providers.providers.map(provider => ({
            state: "same",
            provider
        })) || null);

        const p = info.providers.providers.find(p => p.maxSpan > 0);
        setProofPeriodDays(p ? secondsToDays(p.maxSpan) : WEEK_DAYS);
    };

    const getNewOffers = async () => {
        if (isLoading || !localContractInfo) {
            return;
        }

        setOffersLoading(true);
        setError(null);

        const providers = editProviders?.map(p => p.provider.cid) || [];

        try {
            const resp = await getOffers(providers, "", Number(localContractInfo!.info.fileSize), proofPeriodDays * DAY_SECONDS);
            if (resp.status === 401) {
                setError(t('errors.unauthorizedLoggingOut'));
                console.error('getOffers unauthorized. Logging out.');
                safeDisconnect(tonConnectUI);
                setOffersLoading(false);
                return;
            }
            const offers = resp.data as Offers;
            if (offers?.declines?.length > 0) {
                setError(t('contractErrors.providerDeclined'));
            } else if (offers?.offers?.length > 0 && editProviders && editProviders.length > 0) {
                const updated: providerEdit[] = offers.offers.map(o => {
                    const existing = editProviders.find(ep => ep.provider.cid.toLowerCase() === o.provider.key.toLowerCase());
                    if (!existing) {
                        return null;
                    }

                    return {
                        state: existing.state,
                        provider: {
                            ...existing.provider,
                            ratePerMB: o.price_per_mb ?? 0,
                            maxSpan: o.offer_span ?? 0,
                        }
                    } as providerEdit;
                }).filter(p => p !== null) as providerEdit[];


                setEditProviders(updated);
            } else if (resp && resp.error) {
                console.error("Failed to load providers:", resp.error);
                setError(resp.error);
            } else {
                setError(t('errors.unknownErrorOccurred'));
            }
        } finally {
            setOffersLoading(false);
        }
    }

    const addProvider = async (pubkey: string | null) => {
        if (isLoadingContractInfo || !localContractInfo || !pubkey) {
            return;
        }

        if (pubkey.length !== 64) {
            setError(t('contract.invalidPubKey'));
            return;
        }

        const existingProvider = editProviders?.find(provider => provider.provider.cid === pubkey);
        if (existingProvider) {
            setError(t('contract.providerAlreadyAdded'));
            return;
        }

        setError(null);

        setEditProviders(prev => [
            ...(prev ?? []),
            {
                state: "new",
                provider: {
                    cid: pubkey,
                    ratePerMB: 0,
                    maxSpan: 0,
                    lastProof: 0,
                    nextProofByte: "",
                    nonce: "",
                },
            },
        ]);
    }

    const applyProvidersChanges = async () => {
        if (isLoading || !editProviders || editProviders.length === 0) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const resp = await getUpdateTransaction({
                providers: editProviders.filter(p => p.state !== "deleted").map(p => p.provider.cid),
                bag_size: Number(localContractInfo!.info.fileSize),
                amount: FEE_UPDATE,
                address: contractAddress,
                span: editProviders[0]?.provider.maxSpan | 0,
            });
            if (resp.status === 401) {
                setError(t('errors.unauthorizedLoggingOut'));
                console.error('getUpdateTransaction unauthorized. Logging out.');
                safeDisconnect(tonConnectUI);
                setIsLoading(false);
                setIsEdit(false);
                return;
            }
            if (resp && resp.error) {
                console.error("Failed to get update transaction:", resp.error);
                setError(resp.error);
            }

            const tx = resp.data as Transaction;

            const message = {
                address: tx.address,
                amount: tx.amount.toString(),
                payload: tx.body,
            };

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

                console.log("Update transaction result:", result);
                if (!result.success) {
                    setError(t('errors.failedToSendTransaction'));
                }
            }
        } finally {
            setIsLoading(false);
            setIsEdit(false);
        }
    }

    const providersEditableTableBody = () => {
        if (editProviders === null) {
            return <></>;
        }

        return <>
            {editProviders.map((provider, index) => (
                <tr key={provider.provider.cid} className={`${provider.state === "new"
                    ? "bg-green-50"
                    : (provider.state === "deleted"
                        ? "bg-red-50"
                        : (index % 2 ? "" : "bg-gray-50"))}`}>
                    <td>
                        <div className="flex items-center font-medium">
                            <p>
                                {shortenString(provider.provider.cid.toLowerCase(), 8)}
                            </p>
                            <button
                                onClick={() => copyToClipboard(provider.provider.cid, setCopiedKey)}
                                className={`ml-2 transition-colors duration-200
                                                            ${copiedKey === provider.provider.cid
                                        ? "text-gray-100 font-extrabold drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]"
                                        : "text-gray-700 hover:text-gray-400"
                                    }`}
                            >
                                <Copy className="h-4 w-4" />
                            </button>
                        </div>
                    </td>
                    <td>
                        <div className="flex items-center">
                            {provider.provider.ratePerMB}
                        </div>
                    </td>
                    <td>
                        <div className="flex items-center">
                            {secondsToDays(provider.provider.maxSpan)} {t('contractDetails.days')}
                        </div>
                    </td>
                    <td>
                        <div className="flex items-center">
                            {provider.provider.lastProof !== 0
                                ? (new Date(provider.provider.lastProof * 1000).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })) : ("")}
                        </div>
                    </td>
                    <td>
                        <div className="flex items-center">
                            {provider.provider.nextProofByte}
                        </div>
                    </td>
                    <td>
                        <div className="flex items-center">
                            <p>...</p>
                            <button
                                onClick={() => copyToClipboard(provider.provider.nonce, setCopiedKey)}
                                className={`ml-2 transition-colors duration-200
                                                            ${copiedKey === provider.provider.nonce
                                        ? "text-gray-100 font-extrabold drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]"
                                        : "text-gray-700 hover:text-gray-400"
                                    }`}
                            >
                                <Copy className="h-4 w-4" />
                            </button>
                        </div>
                    </td>
                    <td>
                        <button
                            onClick={() => {
                                if (provider.state === "new") {
                                    setEditProviders(editProviders.filter(p => p.provider.cid !== provider.provider.cid));
                                    return;
                                }

                                setEditProviders(editProviders.map(p => {
                                    if (p.provider.cid === provider.provider.cid) {
                                        switch (p.state) {
                                            case "deleted":
                                                return { ...p, state: "same" };
                                            default:
                                                return { ...p, state: "deleted" };
                                        }
                                    }

                                    return p;
                                }));
                            }}
                            className="p-1 rounded-full"
                            disabled={false}
                        >
                            {
                                provider.state === "deleted" ?
                                    <Undo2 className="h-5 w-5 text-green-500 hover:text-green-300" />
                                    : <CircleX className="h-5 w-5 text-red-500 hover:text-red-300" />
                            }
                        </button>
                    </td>
                </tr>
            ))
            }
        </>
    }

    const providersReadonlyTableBody = () => {
        if (localContractInfo === null) {
            return <></>;
        }

        return (
            <>
                {localContractInfo.providers.providers.map((provider, index) => (
                    <tr key={provider.cid} className={`${index % 2 ? "" : "bg-gray-50"}`}>
                        <td>
                            <div className="flex items-center font-medium">
                                <p>
                                    {shortenString(provider.cid.toLowerCase(), 8)}
                                </p>
                                <button
                                    onClick={() => copyToClipboard(provider.cid, setCopiedKey)}
                                    className={`ml-2 transition-colors duration-200
                                                            ${copiedKey === provider.cid
                                            ? "text-gray-100 font-extrabold drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]"
                                            : "text-gray-700 hover:text-gray-400"
                                        }`}
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                        </td>
                        <td>
                            <div className="flex items-center">
                                {provider.ratePerMB}
                            </div>
                        </td>
                        <td>
                            <div className="flex items-center">
                                {provider.maxSpan}
                            </div>
                        </td>
                        <td>
                            <div className="flex items-center">
                                {provider.lastProof !== 0
                                    ? (new Date(provider.lastProof * 1000).toLocaleString('ru-RU', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })) : ("")}
                            </div>
                        </td>
                        <td>
                            {computeNextProofTime(provider)}
                        </td>
                        <td>
                            {computeStorageProofStatus(localContractInfo.info.bagID, provider.cid, files.list)}
                        </td>
                        <td>
                            <div className="flex items-center">
                                {provider.nextProofByte}
                            </div>
                        </td>
                        <td>
                            <div className="flex items-center">
                                <p>...</p>
                                <button
                                    onClick={() => copyToClipboard(provider.nonce, setCopiedKey)}
                                    className={`ml-2 transition-colors duration-200
                                                                ${copiedKey === provider.nonce
                                            ? "text-gray-100 font-extrabold drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]"
                                            : "text-gray-700 hover:text-gray-400"
                                        }`}
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                        </td>
                        <td>
                            <button
                                onClick={() => { alert(t('contractDetails.withdrawFunds')); }}
                                className="p-1 rounded-full"
                                title={t('contractDetails.withdrawFunds')}
                                disabled={true}
                            >
                                <CircleX className="h-5 w-5 text-gray-400" />
                            </button>
                        </td>
                    </tr>
                ))
                }
            </>
        );
    }

    if (isLoadingContractInfo) {
        return (
            <div className="flex justify-center">
                <div className="p-4 text-gray-500">{t('contract.loadingContractInfo')}</div>
            </div>
        );
    }

    if (!localContractInfo) {
        return (
            <div className="p-4">
                <span>{t('contract.contractNotAvailable')}</span>
            </div>
        );
    }

    return (
        <div className="p-4 text-black space-y-3 max-h-[calc(90vh-16rem)] overflow-y-auto">
            {
                error && <ErrorComponent error={error} />
            }

            {/* Providers list */}
            <div>
                <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center text-gray-500 font-bold">
                        <ListMinus className="w-4 h-4 mr-2" />{t('contract.providersHeading')}
                    </div>
                    <div>
                        {
                            isEdit ? (
                                <div className="flex space-x-2">
                                    <button
                                        type="button"
                                        className="flex items-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md text-sm transition-all duration-200 group"
                                        onClick={() => {
                                            setIsEdit(false);
                                        }}
                                    >
                                        {/* <Cancel className="w-4 h-4 mr-1" /> */}
                                        <span>{t('contract.cancel')}</span>
                                    </button>

                                    {
                                        needOffers ? (
                                            <button
                                                type="button"
                                                className="flex items-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md text-sm transition-all duration-200 group"
                                                onClick={getNewOffers}
                                                disabled={offersLoading || isLoading}
                                            >
                                                {offersLoading ? (
                                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                                ) : null}
                                                <span>{t('contract.getOffers')}</span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="flex items-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md text-sm transition-all duration-200 group"
                                                onClick={applyProvidersChanges}
                                                disabled={isLoading}
                                            >
                                                <span>{t('contract.apply')}</span>
                                            </button>
                                        )
                                    }
                                </div>
                            ) : (
                                <div className="flex">
                                    <button
                                        type="button"
                                        className="flex items-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md text-sm transition-all duration-200 group"
                                        onClick={() => { setLocalContractInfo(null); fetchContractInfo(); }}
                                    >
                                        <RefreshCcw className="w-4 h-4 mr-1" />
                                        <span>{t('contract.reloadList')}</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="flex items-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md text-sm transition-all duration-200 group"
                                        onClick={() => { setIsEdit(true); }}
                                    >
                                        <Pencil className="w-4 h-4 mr-1" />
                                        <span>{t('contract.edit')}</span>
                                    </button>
                                </div>
                            )
                        }
                    </div>
                </div>
                {
                    !error && warn && (
                        <div className="flex flex-col items-center p-4 bg-yellow-50 rounded-lg">
                            <p>{warn}</p>
                        </div>
                    )
                }
                <div>
                    {localContractInfo.providers.providers.length === 0 ? (
                        <div className="text-gray-500 text-center py-4">
                            {t('contract.noProvidersFound')}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="ton-table [&_th:hover]:cursor-default [&_tr:hover]:cursor-default">
                                <thead>
                                    <tr>
                                        <th>
                                            <div className="flex items-center">
                                                {t('contractDetails.publicKey')}
                                            </div>
                                        </th>
                                        <th>
                                            <div className="flex items-center">
                                                {t('contractDetails.ratePerMB')}
                                            </div>
                                        </th>
                                        <th>
                                            <div className="flex items-center">
                                                {t('contractDetails.maxSpan')}
                                            </div>
                                        </th>
                                        <th>
                                            <div className="flex items-center">
                                                {t('contractDetails.lastProof')}
                                            </div>
                                        </th>
                                        {
                                            !isEdit && (
                                                <th>
                                                    <div className="flex items-center">
                                                        {t('contractDetails.nextProofTime')}
                                                        <HintWithIcon text={t('contractDetails.computed')} maxWidth={9} />
                                                    </div>
                                                </th>
                                            )
                                        }
                                        {
                                            !isEdit && (
                                                <th>
                                                    <div className="flex items-center">
                                                        {t('contractDetails.check')}
                                                        <HintWithIcon text={t('contractDetails.storageCheckHint')} maxWidth={17} />
                                                    </div>
                                                </th>
                                            )
                                        }
                                        <th>
                                            <div className="flex items-center">
                                                {t('contractDetails.nextProofByte')}
                                            </div>
                                        </th>
                                        <th>
                                            <div className="flex items-center">
                                                {t('contractDetails.nonce')}
                                            </div>
                                        </th>
                                        <th>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isEdit ? providersEditableTableBody() : providersReadonlyTableBody()}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {
                        isEdit && (
                            <div>
                                {/* Add provider */}
                                <div className="flex justify-center items-end gap-4 mt-8">
                                    <TextField
                                        label={t('chooseProviders.addCustomProvider')}
                                        onChange={(value) => { setNewPubkey(value) }}
                                        placeholder="Pubkey"
                                        disabled={!isEdit}
                                    />
                                    <button
                                        className={`btn text-md flex items-center border rounded px-4 py-2 mb-4 ${isEdit ? 'hover:bg-gray-100' : 'opacity-50 cursor-default'}`}
                                        onClick={() => { addProvider(newPubkey) }}
                                        disabled={!isEdit}
                                    >
                                        {
                                            isLoading ? <Loader2 className="h-4 w-4 mr-2" /> : <PackageOpen className="h-4 w-4 mr-2" />
                                        }
                                        {t('contractDetails.loadInfo')}
                                    </button>
                                </div>

                                {/* Proof period */}
                                <div className="mt-4 mb-2">
                                    <PeriodField
                                        label={t('contractSettings.resetProofPeriod')}
                                        suffix="days"
                                        value={proofPeriodDays}
                                        onChange={setProofPeriodDays}
                                        disabled={isLoading || offersLoading}
                                        isMobile={false}
                                    />
                                </div>
                            </div>
                        )
                    }
                </div>
            </div >

            <br />
            {/* Storage info */}
            <div>
                <div className="flex items-center mb-2 text-gray-500 font-bold">
                    <Info className="w-4 h-4 mr-2" />{t('contractDetails.storage')}
                </div>
                <RenderField
                    label={t('contractDetails.bagID')}
                    value={localContractInfo.info.bagID}
                    url={`${apiBase}/api/v1/gateway/${localContractInfo.info.bagID}`}
                    copy={localContractInfo.info.bagID}
                />

                <RenderField
                    label={t('contractDetails.balance')}
                    value={`${(Number(localContractInfo.providers.balance) / 1_000_000_000).toFixed(4)} TON`}
                />

                <RenderField
                    label={t('contractDetails.fileSize')}
                    value={printSpace(Number(localContractInfo.info.fileSize), true)}
                />

                <RenderField
                    label={t('contractDetails.chunkSize')}
                    value={printSpace(localContractInfo.info.chunkSize, true)}
                />

                <RenderField
                    label={t('contractDetails.owner')}
                    value={localContractInfo.info.owner}
                    url={`https://tonscan.org/address/${localContractInfo.info.owner}`}
                    copy={localContractInfo.info.owner}
                />

                <RenderField
                    label={t('contractDetails.merkleHash')}
                    value={localContractInfo.info.merkleHash}
                    copy={localContractInfo.info.merkleHash}
                />
            </div>

        </div >
    )
}

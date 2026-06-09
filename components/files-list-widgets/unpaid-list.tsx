"use client"

import { getUnpaid, removeFile } from "@/lib/api";
import { UserBag } from "@/types/files";
import { Ban, X, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorComponent } from "../error";
import { useTranslation } from "react-i18next";
import React from "react";
import { useAppStore } from "@/store/useAppStore";
import { useTonConnectUI } from '@tonconnect/ui-react';
import { safeDisconnect } from '@/lib/ton/safeDisconnect';
import { CountdownTimer } from "../countdown-timer";
import { copyToClipboard, printSpace, shortenString } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

export function UnpaidFilesList() {
    const { t } = useTranslation();
    const { updateWidgetData } = useAppStore()
    const [tonConnectUI] = useTonConnectUI();
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [unpaidFiles, setUnpaidFiles] = useState<UserBag[] | null>(null);
    const [freeStorageDuration, setFreeStorageDuration] = useState<number | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const apiBase = useMemo(() => (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || "https://mytonstorage.org", []);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        if (isLoading) return;

        setIsLoading(true);

        const resp = await getUnpaid();
        if (resp.status === 401) {
            setError(t('errors.unauthorizedLoggingOut'));
            console.error('getUnpaid unauthorized. Logging out.');
            safeDisconnect(tonConnectUI);
            setIsLoading(false);
            return;
        }
        if (resp.error) {
            setError(resp.error);
        } else {
            setUnpaidFiles(resp.data.bags || []);
            setFreeStorageDuration(resp.data.free_storage || null);
        }

        setIsLoading(false);
    };

    const cancelStorage = async (bagid: string) => {
        if (isLoading) return;

        setIsLoading(true);

        try {
            const result = await removeFile(bagid);
            if (result.status === 401) {
                setError(t('errors.unauthorizedLoggingOut'));
                console.error('removeFile unauthorized. Logging out.');
                safeDisconnect(tonConnectUI);
                setIsLoading(false);
                return;
            }
            if (result.data === true) {
                console.log("Unpaid file removed successfully");

                updateWidgetData({
                    selectedFiles: [],
                    newBagID: undefined,
                    bagInfo: undefined,
                    description: undefined,

                    selectedProviders: [],

                    storageContractAddress: undefined,
                    paymentStatus: undefined
                });
                fetchData();
            } else if (result.error) {
                console.error("Failed to remove unpaid file:", result.error);
            }
        } catch (error) {
            console.error("Failed to remove unpaid file:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!error && (!unpaidFiles || unpaidFiles.length === 0)) return <div></div>

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center">
                    <Ban className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg pl-2 font-semibold text-gray-900">{t('unpaid.title')}</h2>
                </div>
            </div>

            {error && <ErrorComponent error={error} />}

            {!isLoading && unpaidFiles && unpaidFiles.length > 0 && (
                isMobile ? (
                    <div className="space-y-3">
                        {unpaidFiles.map((f) => (
                            <div
                                key={`mobile-${f.bag_id}`}
                                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200"
                            >
                                {/* Header: Bag ID */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-gray-500 mb-1">{t('unpaid.bagID')}</div>
                                        <div className="flex items-center space-x-2">
                                            <a
                                                href={`${apiBase}/api/v1/gateway/${f.bag_id.toUpperCase()}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono font-medium text-blue-600 hover:text-blue-800 transition-colors"
                                                title={f.bag_id.toUpperCase()}
                                            >
                                                {shortenString(f.bag_id.toUpperCase(), 14)}
                                            </a>
                                            <button
                                                onClick={() => copyToClipboard(f.bag_id.toUpperCase(), setCopiedKey)}
                                                className={`p-1 rounded-md transition-all duration-200 ${copiedKey === f.bag_id.toUpperCase()
                                                    ? "text-green-600 bg-green-50 scale-110"
                                                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                                                    }`}
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-right ml-3">
                                        <div className="text-sm font-semibold text-gray-900">
                                            {printSpace(f.bag_size)}
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="mb-4">
                                    <div className="text-xs font-medium text-gray-500 mb-1">{t('unpaid.description')}</div>
                                    <p className="text-gray-700 line-clamp-2" title={f.description || ''}>
                                        {f.description ? (
                                            shortenString(f.description, 40)
                                        ) : (
                                            <span className="text-gray-400 italic">--</span>
                                        )}
                                    </p>
                                </div>

                                {/* Free Storage Timer */}
                                <div className="mb-4">
                                    <div className="text-xs font-medium text-gray-500 mb-1">{t('unpaid.freeStorage')}</div>
                                    <div className="text-sm text-gray-700">
                                        {freeStorageDuration ? (
                                            <CountdownTimer expirationTime={f.created_at + freeStorageDuration} />
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end pt-3 border-t border-gray-100">
                                    <button
                                        onClick={() => cancelStorage(f.bag_id)}
                                        className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-red-50 transition-all duration-200"
                                        title={t('unpaid.removeUnpaidFileTitle')}
                                    >
                                        <X className="h-4 w-4 text-red-500 hover:text-red-600" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="ton-table overscroll-x-auto">
                            <thead>
                                <tr>
                                    <th>
                                        <div className="flex items-center ml-2">{t('unpaid.bagID')}</div>
                                    </th>
                                    <th>
                                        <div className="flex items-center">{t('unpaid.description')}</div>
                                    </th>
                                    <th>
                                        <div className="flex items-center">{t('unpaid.size')}</div>
                                    </th>
                                    <th>
                                        <div className="flex items-center">{t('unpaid.freeStorage')}</div>
                                    </th>
                                    <th className="w-8">{t('unpaid.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unpaidFiles.map((f, index) => (
                                    <React.Fragment key={f.bag_id}>
                                        <tr className={`group ${index % 2 ? "" : "bg-gray-50"} transition-colors duration-200`}>
                                            <td>
                                                <div className="flex items-center">
                                                    <a
                                                        href={`${apiBase}/api/v1/gateway/${f.bag_id.toUpperCase()}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:underline"
                                                        title={f.bag_id.toUpperCase()}>
                                                        {shortenString(f.bag_id.toUpperCase(), 8)}
                                                    </a>
                                                    <button
                                                        onClick={() => copyToClipboard(f.bag_id.toUpperCase(), setCopiedKey)}
                                                        className={`ml-2 transition-colors duration-200 ${copiedKey === f.bag_id.toUpperCase() ? "text-gray-100 font-extrabold drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]" : "text-gray-700 hover:text-gray-400"}`}
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center" title={f.description}>{shortenString(f.description || '', 35)}</div>
                                            </td>
                                            <td>
                                                <div className="flex items-center">{printSpace(f.bag_size)}</div>
                                            </td>
                                            <td>
                                                <div className="flex items-center w-40">
                                                    {freeStorageDuration ? (
                                                        <CountdownTimer expirationTime={f.created_at + freeStorageDuration} />
                                                    ) : (
                                                        <span className="text-gray-500">—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => cancelStorage(f.bag_id)}
                                                    className="flex p-1 rounded-full hover:bg-gray-100"
                                                    title={t('unpaid.removeUnpaidFileTitle')}
                                                >
                                                    <X className="h-5 w-5 text-red-500" />
                                                </button>
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    )
}

"use client"

import { useAppStore } from "@/store/useAppStore";
import { printSpace } from "@/lib/utils";
import { Info, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function StorageInfo() {
    const { t } = useTranslation();
    const { upload, resetWidgetData } = useAppStore();
    const widgetData = upload.widgetData;
    const isMobile = useIsMobile();
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const apiBase = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || "https://mytonstorage.org";

    const shortenBagId = (bagId: string) => {
        if (!bagId || bagId.length <= 8) return bagId;
        return `${bagId.substring(0, 4)}...${bagId.substring(bagId.length - 4)}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedKey(text);
            setTimeout(() => setCopiedKey(null), 2000);
        });
    };

    const resetWidgets = () => {
        resetWidgetData();
    }

    return (
        <div className={`${isMobile ? 'mt-4' : 'mt-16'} w-full`}>
            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center">
                    <Info className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg pl-2 font-semibold text-gray-900">{t('widgets.contractDeployed')}</h2>
                </div>
            </div>

            {/* Bag info */}
            {widgetData.bagInfo && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center mb-2">
                                <span className="font-semibold w-32 inline-block">{t('newBag.bagID')}</span>
                                <a
                                    href={`${apiBase}/api/v1/gateway/${widgetData.bagInfo!.bag_id.toUpperCase()}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline mr-2"
                                    title={widgetData.bagInfo!.bag_id.toUpperCase()}
                                >
                                    {shortenBagId(widgetData.bagInfo!.bag_id.toUpperCase())}
                                </a>
                                <button
                                    onClick={() => copyToClipboard(widgetData.bagInfo!.bag_id.toUpperCase())}
                                    className="p-1 hover:bg-gray-200 rounded"
                                    title="Копировать BagID"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                {copiedKey === widgetData.bagInfo!.bag_id.toUpperCase() && (
                                    <span className="ml-2 text-sm text-green-600">Скопировано!</span>
                                )}
                            </div>

                            <div className="mb-2">
                                <span className="font-semibold w-32 inline-block">{t('newBag.description')}</span>
                                <div className="text-gray-800 break-words whitespace-pre-wrap">
                                    {widgetData.bagInfo!.description || '—'}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center mb-2">
                                <span className="font-semibold w-32 inline-block">{t('newBag.filesCount')}</span>
                                <span className="text-gray-800">{widgetData.bagInfo!.files_count}</span>
                            </div>

                            <div className="flex items-center mb-2">
                                <span className="font-semibold w-32 inline-block">{t('newBag.bagSize')}</span>
                                <span className="text-gray-800">{printSpace(widgetData.bagInfo!.bag_size)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">{t('widgets.whatsNext')}</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li>• {t('widgets.filesStored')}</li>
                        <li>• {t('widgets.providersDownloading')}</li>
                        <li>• {t('widgets.monitorStatus')}</li>
                        <li>• {t('widgets.viewContract')} <a href={`https://tonscan.org/address/${widgetData.storageContractAddress}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">TON Scan</a></li>
                    </ul>
                </div>
            </div>

            <div className="flex justify-between mt-8">
                <button
                    className="btn ml-auto px-4 py-2 rounded bg-green-500 text-white hover:bg-green-600"
                    onClick={resetWidgets}
                >
                    {t('widgets.complete')}
                </button>
            </div>
        </div>
    );
}

"use client"

import { ReactNode, useEffect, useState } from "react"
import { TonConnectUIProvider, THEME, useTonConnectUI, Locales } from "@tonconnect/ui-react"
import { i18nInstance } from "./i18n-provider"

interface TonConnectProviderProps {
  children: ReactNode
}

function TonConnectLanguageSync({ children }: { children: ReactNode }) {
  const [, setOptions] = useTonConnectUI();

  useEffect(() => {
    setOptions({ language: i18nInstance.language as Locales });

    const handleLanguageChanged = (lng: string) => {
      setOptions({ language: lng as Locales });
    };

    i18nInstance.on('languageChanged', handleLanguageChanged);
    return () => {
      i18nInstance.off('languageChanged', handleLanguageChanged);
    };
  }, [setOptions]);

  return <>{children}</>;
}

export function TonConnectProvider({ children }: TonConnectProviderProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <TonConnectUIProvider 
      uiPreferences={{ theme: THEME.LIGHT }}
      manifestUrl={(typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL) || "https://mytonstorage.org/tonconnect-manifest.json"}
    >
      <TonConnectLanguageSync>
        {children}
      </TonConnectLanguageSync>
    </TonConnectUIProvider>
  )
}

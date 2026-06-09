import axios, { AxiosError } from "axios"
import { FileMetadata, Offers, ProviderOffer, UnpaidBags } from "@/types/files";
import { ApiResponse, BagInfoShort, InitStorageContract, TopupBalance, Transaction, UpdateStorageContract } from "./types";
import { handleError } from "./utils";

const offersCache = new Map<string, ProviderOffer>();
const OFFERS_CACHE_TTL = 1000 * 60 * 15; // 15 минут

// API base URL from env with safe fallback
const host = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || "https://mytonstorage.org";

export async function setBagStorageContract(bagId: string, addr: string): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: boolean | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/files/paid`, { bag_id: bagId, storage_contract: addr }, {
      withCredentials: true
    });
    data = response.status === 200;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getDescriptions(addresses: string[]): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: BagInfoShort[] | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/files/details`, { contracts: addresses }, {
      withCredentials: true
    });
    data = response.data as BagInfoShort[];
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getDeployTransaction(initStorageContract: InitStorageContract): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: Transaction | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/contracts/init-contract`, initStorageContract, {
      withCredentials: true
    });
    data = response.data as Transaction;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getUpdateTransaction(updateStorageContract: UpdateStorageContract): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: Transaction | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/contracts/update`, updateStorageContract, {
      withCredentials: true
    });
    data = response.data as Transaction;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getTopupBalanceTransaction(tb: TopupBalance): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: Transaction | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/contracts/topup`, tb, {
      withCredentials: true
    });
    data = response.data as Transaction;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getWithdrawTransaction(contractAddress: string): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: Transaction | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/contracts/withdraw`, { address: contractAddress }, {
      withCredentials: true
    });
    data = response.data as Transaction;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getOffers(providers: string[], bagID: string, bagSize: number, span: number): Promise<ApiResponse> {
  const cachedOffers: ProviderOffer[] = [];
  const uncachedProviders: string[] = [];

  for (const providerKey of providers) {
    const cacheKey = `${bagID}:${providerKey.toLowerCase()}:${span}`;
    const cached = offersCache.get(cacheKey);
    if (cached) {
      cachedOffers.push(cached);
    } else {
      uncachedProviders.push(providerKey);
    }
  }

  if (uncachedProviders.length === 0) {
    return { error: null, status: 200, data: { offers: cachedOffers, declines: [] } as Offers };
  }

  var error: string | null = null;
  var status: number | null = null;
  var data: Offers | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/providers/offers`, {
      bag_id: bagID,
      bag_size: bagSize,
      span: span,
      providers: uncachedProviders
    }, {
      withCredentials: true
    });
    data = response.data as Offers;
    status = response.status;

    if (data?.offers) {
      for (const offer of data.offers) {
        const cacheKey = `${bagID}:${offer.provider.key.toLowerCase()}:${span}`;
        offersCache.set(cacheKey, offer);
        setTimeout(() => offersCache.delete(cacheKey), OFFERS_CACHE_TTL);
      }
    }
    
    data.offers = [...cachedOffers, ...data.offers];
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return { error, status, data };
}

// todo: call when leave (providers selection, storage period) pages
export function clearOffersCache() {
  offersCache.clear();
}

export async function removeFile(bagId: string): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: boolean | null = null;

  try {
    const response = await axios.delete(`${host}/api/v1/files/${bagId}`, {
      withCredentials: true
    });
    data = response.status === 200;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function addFile(file: File, metadata: FileMetadata, setProgress: (progress: number) => void): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('description', metadata.description);

  var error: string | null = null;
  var status: number | null = null;
  var data: UnpaidBags | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      withCredentials: true,
      timeout: 600000, // 10 minutes for large files
      maxContentLength: 4 << 30, // 4 GB max file size
      maxBodyLength: 4 << 30, // 4 GB max body size
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(progress);
        }
      }
    });

    data = response.data as UnpaidBags
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function getUnpaid(): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: UnpaidBags | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/files/unpaid`, {}, {
      withCredentials: true
    });
    data = response.data as UnpaidBags;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function addFolder(files: File[], metadata: FileMetadata, setProgress: (progress: number) => void): Promise<ApiResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    const filename = file.webkitRelativePath || file.name;
    formData.append('file', file, filename);
  });

  formData.append('description', metadata.description);

  var error: string | null = null;
  var status: number | null = null;
  var data: UnpaidBags | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      withCredentials: true,
      timeout: 600000, // 10 minutes for large files
      maxContentLength: 4 << 30, // 4 GB max file size
      maxBodyLength: 4 << 30, // 4 GB max body size
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(progress);
        }
      }
    });
    data = response.data as UnpaidBags;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function proofPayload(): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: string | null = null;

  try {
    const response = await axios.get(`${host}/api/v1/ton-proof`);
    data = response.data?.data as string;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

export async function login(address: string, proof: string, walletStateInit: any): Promise<ApiResponse> {
  var error: string | null = null;
  var status: number | null = null;
  var data: boolean | null = null;

  try {
    const response = await axios.post(`${host}/api/v1/login`, {
      address,
      proof,
      state_init: walletStateInit
    }, {
      withCredentials: true
    });
    data = response.status === 200;
    status = response.status;
  } catch (err: AxiosError | any) {
    error = handleError(err);
    if (err.response?.status) {
      status = err.response.status;
    }
  }

  return {
    error: error,
    status: status,
    data: data
  }
}

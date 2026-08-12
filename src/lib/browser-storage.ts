type ReadableStorage = {
	getItem: (key: string) => string | null;
};

type WritableStorage = {
	setItem: (key: string, value: string) => void;
};

export function safeGetStorageItem(
	storage: ReadableStorage | null | undefined,
	key: string,
) {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

export function safeSetStorageItem(
	storage: WritableStorage | null | undefined,
	key: string,
	value: string,
) {
	try {
		if (!storage) return false;
		storage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

export function getBrowserStorage() {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

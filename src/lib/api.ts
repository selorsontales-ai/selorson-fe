import { PUBLIC_API_BASE } from '$env/static/public';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiOptions {
	method?: Method;
	body?: unknown;
	headers?: Record<string, string>;
	token?: string;
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	data: T;
	message?: string;
	meta?: {
		current_page: number;
		per_page: number;
		total: number;
		total_pages: number;
	};
}

export interface ApiError {
	success: false;
	message: string;
	errors?: Record<string, string[]>;
}

/**
 * Typed fetch wrapper for the V3 API.
 * Matches the V2 response format: { success, data, message }
 */
export async function api<T = unknown>(
	endpoint: string,
	options: ApiOptions = {}
): Promise<ApiResponse<T>> {
	const { method = 'GET', body, headers = {}, token } = options;

	const url = `${PUBLIC_API_BASE}${endpoint}`;

	const reqHeaders: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...headers,
	};

	if (token) {
		reqHeaders['Authorization'] = `Bearer ${token}`;
	} else if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('selorson_token');
		if (stored) {
			reqHeaders['Authorization'] = `Bearer ${stored}`;
		}
	}

	const res = await fetch(url, {
		method,
		headers: reqHeaders,
		body: body ? JSON.stringify(body) : undefined,
		credentials: 'include',
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw {
			status: res.status,
			...json,
		} as ApiError & { status: number };
	}

	return json as ApiResponse<T>;
}

/**
 * Upload files via multipart/form-data.
 * Does NOT set Content-Type — lets the browser set the boundary.
 */
export async function apiUpload<T = unknown>(
	endpoint: string,
	formData: FormData
): Promise<ApiResponse<T>> {
	const url = `${PUBLIC_API_BASE}${endpoint}`;

	const reqHeaders: Record<string, string> = {
		Accept: 'application/json',
	};

	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('selorson_token');
		if (stored) reqHeaders['Authorization'] = `Bearer ${stored}`;
	}

	const res = await fetch(url, {
		method: 'POST',
		headers: reqHeaders,
		body: formData,
		credentials: 'include',
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw { status: res.status, ...json } as ApiError & { status: number };
	}

	return json as ApiResponse<T>;
}

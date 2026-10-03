import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  ApiKeyRow,
  ApiUsage,
  AuthorizedRetailers,
  IssuedApiKey,
  MapViolationRow,
  Quote,
  QuoteSummary,
  ReportDetail,
  ReportSummary,
  UnauthorizedListing,
} from '@/types/business.types';

const brand = (orgId: string) => `/brand/workspaces/${orgId}`;
const quotes = (orgId: string) => `/procurement/workspaces/${orgId}/quotes`;

const unwrap = <T>(res: { data: ApiResponse<T> }) => res.data.data;

/** Fetches a file with the session and hands it to the browser as a download. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await apiClient.get<Blob>(path, { responseType: 'blob', timeout: 60000 });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const businessApi = {
  violations: async (orgId: string) =>
    unwrap(await apiClient.get<ApiResponse<MapViolationRow[]>>(`${brand(orgId)}/map/violations`, { params: { limit: 200 } })),
  violationsCsvPath: (orgId: string) => `${brand(orgId)}/map/violations.csv`,
  acknowledge: async (orgId: string, eventId: string) => {
    await apiClient.post(`/seller/workspaces/${orgId}/events/${eventId}/acknowledge`, {});
  },
  setMap: async (orgId: string, product: { sku: string; name: string }, mapPrice: number | null) =>
    unwrap(await apiClient.put<ApiResponse<{ id: string }>>(`/seller/workspaces/${orgId}/products`, { ...product, mapPrice })),

  authorized: async (orgId: string) =>
    unwrap(await apiClient.get<ApiResponse<AuthorizedRetailers>>(`${brand(orgId)}/authorized-retailers`)),
  setAuthorized: async (orgId: string, platformIds: string[]) =>
    unwrap(await apiClient.put<ApiResponse<{ authorized: number }>>(`${brand(orgId)}/authorized-retailers`, { platformIds })),
  unauthorized: async (orgId: string) =>
    unwrap(await apiClient.get<ApiResponse<{ declared: boolean; listings: UnauthorizedListing[] }>>(`${brand(orgId)}/unauthorized-sellers`)),

  reports: async (orgId: string) => unwrap(await apiClient.get<ApiResponse<ReportSummary[]>>(`${brand(orgId)}/reports`)),
  report: async (orgId: string, reportId: string) =>
    unwrap(await apiClient.get<ApiResponse<ReportDetail>>(`${brand(orgId)}/reports/${reportId}`)),
  generateReport: async (orgId: string, period: 'WEEKLY' | 'MONTHLY') =>
    unwrap(await apiClient.post<ApiResponse<{ id: string }>>(`${brand(orgId)}/reports`, { period })),
  reportFilePath: (orgId: string, reportId: string, kind: 'csv' | 'pdf') => `${brand(orgId)}/reports/${reportId}/${kind}`,

  quotes: async (orgId: string) => unwrap(await apiClient.get<ApiResponse<QuoteSummary[]>>(quotes(orgId))),
  quote: async (orgId: string, quoteId: string) => unwrap(await apiClient.get<ApiResponse<Quote>>(`${quotes(orgId)}/${quoteId}`)),
  createQuote: async (
    orgId: string,
    input: { title: string; notes?: string; items: Array<{ query: string; quantity?: number; maxUnitPrice?: number; specs?: string; note?: string }> },
  ) => unwrap(await apiClient.post<ApiResponse<Quote>>(quotes(orgId), input, { timeout: 60000 })),
  repriceQuote: async (orgId: string, quoteId: string) =>
    unwrap(await apiClient.post<ApiResponse<Quote>>(`${quotes(orgId)}/${quoteId}/reprice`, {}, { timeout: 60000 })),
  finalizeQuote: async (orgId: string, quoteId: string) =>
    unwrap(await apiClient.post<ApiResponse<Quote>>(`${quotes(orgId)}/${quoteId}/finalize`, {})),
  updateQuoteItem: async (orgId: string, quoteId: string, itemId: string, body: { quantity?: number; note?: string; maxUnitPrice?: number }) =>
    unwrap(await apiClient.patch<ApiResponse<Quote>>(`${quotes(orgId)}/${quoteId}/items/${itemId}`, body)),
  deleteQuote: async (orgId: string, quoteId: string) => {
    await apiClient.delete(`${quotes(orgId)}/${quoteId}`);
  },
  quoteFilePath: (orgId: string, quoteId: string, kind: 'csv' | 'pdf') => `${quotes(orgId)}/${quoteId}/${kind}`,

  apiKeys: async (orgId: string) => unwrap(await apiClient.get<ApiResponse<ApiKeyRow[]>>(`/workspaces/${orgId}/api-keys`)),
  issueKey: async (orgId: string, input: { name: string; scopes: string[] }) =>
    unwrap(await apiClient.post<ApiResponse<IssuedApiKey>>(`/workspaces/${orgId}/api-keys`, input)),
  revokeKey: async (orgId: string, keyId: string) => {
    await apiClient.delete(`/workspaces/${orgId}/api-keys/${keyId}`);
  },
  apiUsage: async (orgId: string, days = 30) =>
    unwrap(await apiClient.get<ApiResponse<ApiUsage>>(`/workspaces/${orgId}/api-keys/usage`, { params: { days } })),
};

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IngestProgress, OrderDetail, OrderListResponse, SagaStatus } from '../models';

/**
 * Single HttpClient wrapper - the coordinator is the sole facade for the whole system, so
 * this is the only place the frontend talks to a backend. Requests use relative paths
 * (/api/...): `ng serve` proxies them per proxy.conf.json, and the production nginx config
 * proxies them to the coordinator container, so no base URL or CORS config is needed here.
 */
@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  constructor(private readonly http: HttpClient) {}

  listOrders(params: { status?: SagaStatus; page: number; pageSize: number }): Observable<OrderListResponse> {
    const query: Record<string, string> = {
      page: String(params.page),
      pageSize: String(params.pageSize),
    };
    if (params.status) query['status'] = params.status;
    return this.http.get<OrderListResponse>('/api/orders', { params: query });
  }

  getOrder(orderId: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`/api/orders/${orderId}`);
  }

  retryCompensation(orderId: string): Observable<{ accepted: boolean }> {
    return this.http.post<{ accepted: boolean }>(`/api/orders/${orderId}/retry-compensation`, {});
  }

  markShipped(orderId: string): Observable<{ accepted: boolean }> {
    return this.http.post<{ accepted: boolean }>(`/api/orders/${orderId}/mark-shipped`, {});
  }

  uploadCsv(file: File): Observable<{ accepted: boolean; ingestJobId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ accepted: boolean; ingestJobId: string }>('/api/csv/upload', formData);
  }

  getIngestStatus(ingestJobId: string): Observable<IngestProgress> {
    return this.http.get<IngestProgress>(`/api/csv/upload/${ingestJobId}/status`);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OrdersApiService } from '../../core/services/orders-api.service';
import { OrderListResponse, SagaStatus } from '../../core/models';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { CsvUploadComponent } from '../csv-upload/csv-upload.component';

const PAGE_SIZE = 20;
const ALL_STATUSES: SagaStatus[] = ['IN_PROGRESS', 'PLACED', 'SHIPPED', 'CANCELLED', 'NEEDS_ATTENTION'];

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StatusBadgeComponent, CsvUploadComponent],
  template: `
    <div class="header">
      <h1>Orders</h1>
      <app-csv-upload (ingestionComplete)="reload()" />
    </div>

    <div class="filters">
      <label>
        Status:
        <select [(ngModel)]="statusFilter" (ngModelChange)="onFilterChange()">
          <option [ngValue]="undefined">All</option>
          @for (s of statuses; track s) {
            <option [ngValue]="s">{{ s }}</option>
          }
        </select>
      </label>
      <button (click)="reload()">Refresh</button>
    </div>

    @if (response) {
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>Amount</th>
            <th>Steps done</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          @for (order of response.items; track order.orderId) {
            <tr>
              <td><a [routerLink]="['/orders', order.orderId]">{{ order.orderId }}</a></td>
              <td><app-status-badge [status]="order.status" /></td>
              <td>{{ order.sku }}</td>
              <td>{{ order.qty }}</td>
              <td>{{ order.amount }}</td>
              <td>
                @for (step of order.steps; track step.stepName + step.phase) {
                  <span class="chip" [class.done]="step.status === 'DONE'" [class.failed]="step.status === 'FAILED'">
                    {{ step.stepName }}{{ step.phase === 'UNDO' ? ' (undo)' : '' }}
                  </span>
                }
              </td>
              <td>{{ order.createdAt | date: 'short' }}</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="pagination">
        <button (click)="prevPage()" [disabled]="page === 1">Previous</button>
        <span>Page {{ page }} of {{ totalPages }} ({{ response.total }} orders)</span>
        <button (click)="nextPage()" [disabled]="page >= totalPages">Next</button>
      </div>
    } @else {
      <p>Loading...</p>
    }
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .filters {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: left;
        padding: 8px 12px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 0.9rem;
      }
      .chip {
        display: inline-block;
        padding: 1px 6px;
        margin: 1px;
        border-radius: 4px;
        background: #f1f5f9;
        font-size: 0.75rem;
      }
      .chip.done {
        background: #dcfce7;
        color: #166534;
      }
      .chip.failed {
        background: #fee2e2;
        color: #991b1b;
      }
      .pagination {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-top: 16px;
      }
    `,
  ],
})
export class OrderListComponent implements OnInit {
  statuses = ALL_STATUSES;
  statusFilter: SagaStatus | undefined = undefined;
  page = 1;
  response: OrderListResponse | null = null;

  get totalPages(): number {
    if (!this.response) return 1;
    return Math.max(1, Math.ceil(this.response.total / PAGE_SIZE));
  }

  constructor(private readonly api: OrdersApiService) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.listOrders({ status: this.statusFilter, page: this.page, pageSize: PAGE_SIZE }).subscribe((res) => {
      this.response = res;
    });
  }

  onFilterChange(): void {
    this.page = 1;
    this.reload();
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
      this.reload();
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.reload();
    }
  }
}

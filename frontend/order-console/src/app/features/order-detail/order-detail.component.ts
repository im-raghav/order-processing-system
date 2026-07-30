import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrdersApiService } from '../../core/services/orders-api.service';
import { OrderDetail } from '../../core/models';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusBadgeComponent],
  template: `
    <a routerLink="/orders">&larr; Back to orders</a>

    @if (order) {
      <div class="header">
        <h1>{{ order.orderId }}</h1>
        <app-status-badge [status]="order.status" />
      </div>

      <dl class="summary">
        <dt>SKU</dt>
        <dd>{{ order.sku }}</dd>
        <dt>Qty</dt>
        <dd>{{ order.qty }}</dd>
        <dt>Amount</dt>
        <dd>{{ order.amount }}</dd>
        <dt>Created</dt>
        <dd>{{ order.createdAt | date: 'medium' }}</dd>
      </dl>

      <div class="actions">
        @if (order.status === 'NEEDS_ATTENTION') {
          <button (click)="retry()" [disabled]="actionInFlight">Retry compensation</button>
        }
        @if (order.status === 'PLACED') {
          <button (click)="markShipped()" [disabled]="actionInFlight">Mark Shipped</button>
        }
      </div>

      <h2>Step history</h2>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Phase</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Last error</th>
            <th>Started</th>
            <th>Finished</th>
          </tr>
        </thead>
        <tbody>
          @for (step of order.steps; track step.id) {
            <tr>
              <td>{{ step.stepName }}</td>
              <td>{{ step.phase }}</td>
              <td>{{ step.status }}</td>
              <td>{{ step.attempts }}</td>
              <td class="error">{{ step.lastError }}</td>
              <td>{{ step.startedAt | date: 'medium' }}</td>
              <td>{{ step.finishedAt | date: 'medium' }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p>Loading...</p>
    }
  `,
  styles: [
    `
      .header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
      }
      .summary {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 16px;
        margin: 16px 0;
      }
      dt {
        font-weight: 600;
        color: #475569;
      }
      .actions {
        margin: 16px 0;
        display: flex;
        gap: 12px;
      }
      button {
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        background: #2563eb;
        color: white;
        font-weight: 600;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      th,
      td {
        text-align: left;
        padding: 8px 12px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 0.9rem;
      }
      .error {
        color: #dc2626;
        max-width: 300px;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class OrderDetailComponent implements OnInit {
  order: OrderDetail | null = null;
  actionInFlight = false;
  private orderId!: string;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: OrdersApiService,
  ) {}

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('orderId')!;
    this.reload();
  }

  reload(): void {
    this.api.getOrder(this.orderId).subscribe((order) => {
      this.order = order;
    });
  }

  retry(): void {
    this.actionInFlight = true;
    this.api.retryCompensation(this.orderId).subscribe({
      next: () => {
        this.actionInFlight = false;
        this.reload();
      },
      error: () => {
        this.actionInFlight = false;
      },
    });
  }

  markShipped(): void {
    this.actionInFlight = true;
    this.api.markShipped(this.orderId).subscribe({
      next: () => {
        this.actionInFlight = false;
        this.reload();
      },
      error: () => {
        this.actionInFlight = false;
      },
    });
  }
}

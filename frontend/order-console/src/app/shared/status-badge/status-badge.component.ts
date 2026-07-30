import { Component, Input } from '@angular/core';
import { SagaStatus } from '../../core/models';

const STATUS_COLORS: Record<SagaStatus, string> = {
  IN_PROGRESS: '#94a3b8',
  PLACED: '#16a34a',
  SHIPPED: '#2563eb',
  CANCELLED: '#dc2626',
  NEEDS_ATTENTION: '#d97706',
};

const STATUS_LABELS: Record<SagaStatus, string> = {
  IN_PROGRESS: 'In progress',
  PLACED: 'Placed',
  SHIPPED: 'Shipped',
  CANCELLED: 'Cancelled',
  NEEDS_ATTENTION: 'Needs attention',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [style.background]="color">{{ label }}</span>`,
  styles: [
    `
      .badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 999px;
        color: white;
        font-size: 0.8rem;
        font-weight: 600;
        white-space: nowrap;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: SagaStatus;

  get color(): string {
    return STATUS_COLORS[this.status];
  }

  get label(): string {
    return STATUS_LABELS[this.status];
  }
}

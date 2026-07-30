import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrdersApiService } from '../../core/services/orders-api.service';
import { IngestProgress } from '../../core/models';

@Component({
  selector: 'app-csv-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload">
      <label class="file-btn">
        Upload CSV
        <input type="file" accept=".csv" (change)="onFileSelected($event)" [disabled]="uploading" />
      </label>

      @if (progress) {
        <span class="progress">
          {{ progress.rowsRead }} read / {{ progress.rowsInserted }} new /
          {{ progress.rowsSkippedDuplicate }} duplicate
          @if (!progress.done) {
            <span> - ingesting...</span>
          } @else if (progress.error) {
            <span class="error"> - failed: {{ progress.error }}</span>
          } @else {
            <span> - done</span>
          }
        </span>
      }
    </div>
  `,
  styles: [
    `
      .upload {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .file-btn {
        position: relative;
        display: inline-block;
        padding: 8px 16px;
        background: #2563eb;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .file-btn input[type='file'] {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .progress {
        font-size: 0.85rem;
        color: #475569;
      }
      .error {
        color: #dc2626;
      }
    `,
  ],
})
export class CsvUploadComponent {
  @Output() ingestionComplete = new EventEmitter<void>();

  uploading = false;
  progress: IngestProgress | null = null;

  constructor(private readonly api: OrdersApiService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading = true;
    this.progress = null;

    this.api.uploadCsv(file).subscribe({
      next: (res) => this.pollProgress(res.ingestJobId),
      error: () => {
        this.uploading = false;
      },
    });

    input.value = '';
  }

  private pollProgress(ingestJobId: string): void {
    const poll = () => {
      this.api.getIngestStatus(ingestJobId).subscribe((progress) => {
        this.progress = progress;
        if (progress.done) {
          this.uploading = false;
          this.ingestionComplete.emit();
        } else {
          setTimeout(poll, 1000);
        }
      });
    };
    poll();
  }
}

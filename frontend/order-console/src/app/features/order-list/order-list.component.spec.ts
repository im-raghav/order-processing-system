import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { OrderListComponent } from './order-list.component';
import { OrdersApiService } from '../../core/services/orders-api.service';
import { OrderListResponse } from '../../core/models';

describe('OrderListComponent', () => {
  let fixture: ComponentFixture<OrderListComponent>;
  let apiSpy: jasmine.SpyObj<OrdersApiService>;

  const sampleResponse: OrderListResponse = {
    items: [
      {
        orderId: 'ORD1',
        status: 'PLACED',
        sku: 'SKU1',
        qty: 2,
        amount: '19.98',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [{ stepName: 'CREATE_ORDER', phase: 'DO', status: 'DONE' }],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  };

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj('OrdersApiService', ['listOrders']);
    apiSpy.listOrders.and.returnValue(of(sampleResponse));

    await TestBed.configureTestingModule({
      imports: [OrderListComponent],
      providers: [provideRouter([]), { provide: OrdersApiService, useValue: apiSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderListComponent);
    fixture.detectChanges();
  });

  it('loads orders on init and renders them', () => {
    expect(apiSpy.listOrders).toHaveBeenCalledWith({ status: undefined, page: 1, pageSize: 20 });
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('ORD1');
  });

  it('resets to page 1 and re-fetches when the status filter changes', () => {
    fixture.componentInstance.page = 3;
    fixture.componentInstance.statusFilter = 'CANCELLED';
    fixture.componentInstance.onFilterChange();

    expect(fixture.componentInstance.page).toBe(1);
    expect(apiSpy.listOrders).toHaveBeenCalledWith({ status: 'CANCELLED', page: 1, pageSize: 20 });
  });
});

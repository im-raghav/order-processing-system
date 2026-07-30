import { Routes } from '@angular/router';
import { OrderListComponent } from './features/order-list/order-list.component';
import { OrderDetailComponent } from './features/order-detail/order-detail.component';

export const routes: Routes = [
  { path: '', redirectTo: 'orders', pathMatch: 'full' },
  { path: 'orders', component: OrderListComponent },
  { path: 'orders/:orderId', component: OrderDetailComponent },
  { path: '**', redirectTo: 'orders' },
];

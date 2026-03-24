import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiConfigService } from '../api-config.service';

export interface ItemModel {
  name: string;
  gen: string;
  release: string;
  cost: number;
}

@Injectable({
  providedIn: 'root',
})
export class Item {
  private apiConfigService = inject(ApiConfigService);

  constructor(private http: HttpClient) {}

  private get api(): string {
    return `${this.apiConfigService.getApiUrl()}${environment.api.items}`;
  }

  // Get methods
  get(): Observable<ItemModel[]> {
    return this.http.get<ItemModel[]>(this.api);
  }

  getById(id: string): Observable<ItemModel> {
    return this.http.get<ItemModel>(`${this.api}/${id}`);
  }
}

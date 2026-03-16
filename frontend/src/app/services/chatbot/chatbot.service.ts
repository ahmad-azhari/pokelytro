import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiConfigService } from '../api-config.service';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatbotService {
  private apiConfigService = inject(ApiConfigService);
  private http = inject(HttpClient);

  private get api(): string {
    return `${this.apiConfigService.getApiUrl()}${environment.api.chatbot}`;
  }

  sendMessage(message: string, history: ChatMessage[]): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(this.api, { message, history });
  }
}

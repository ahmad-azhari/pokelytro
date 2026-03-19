import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiConfigService } from '../api-config.service';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface ChatReply {
  reply: string;
}

interface ChatHistoryResponse {
  messages: ChatMessage[];
}

@Injectable({
  providedIn: 'root',
})
export class ChatbotService {
  private apiConfigService = inject(ApiConfigService);
  private http = inject(HttpClient);

  private get messageApi(): string {
    return `${this.apiConfigService.getApiUrl()}${environment.api.chatbot}`;
  }

  private get historyApi(): string {
    return this.messageApi.replace('/message', '/history');
  }

  sendMessage(message: string, sessionId: string): Observable<ChatReply> {
    return this.http.post<ChatReply>(this.messageApi, { message, sessionId });
  }

  getHistory(sessionId: string): Observable<ChatHistoryResponse> {
    return this.http.get<ChatHistoryResponse>(`${this.historyApi}?sessionId=${encodeURIComponent(sessionId)}`);
  }
}

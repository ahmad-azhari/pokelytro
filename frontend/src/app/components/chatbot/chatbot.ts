import { Component, signal, computed, ViewChild, ElementRef, AfterViewChecked, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { isPlatformBrowser } from '@angular/common';
import { ChatbotService, ChatMessage } from '../../services/chatbot/chatbot.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-chatbot',
  imports: [FormsModule, MatIconModule, MatButtonModule, MarkdownPipe],
  templateUrl: './chatbot.html',
  styleUrl: './chatbot.css',
})
export class Chatbot implements OnInit, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  private chatbotService = inject(ChatbotService);
  private platformId = inject(PLATFORM_ID);
  private readonly sessionStorageKey = 'lytrobot.session.id';

  isOpen = signal(false);
  messages = signal<ChatMessage[]>([]);
  inputText = signal('');
  isLoading = signal(false);
  hasNewMessage = signal(false);
  sessionId = signal('');

  messageCount = computed(() => this.messages().length);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const existingSessionId = localStorage.getItem(this.sessionStorageKey);
    const nextSessionId = existingSessionId || this.generateSessionId();

    if (!existingSessionId) {
      localStorage.setItem(this.sessionStorageKey, nextSessionId);
    }

    this.sessionId.set(nextSessionId);
    this.loadHistory();
  }

  toggleChat(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.hasNewMessage.set(false);
      setTimeout(() => this.focusInput(), 100);
    }
  }

  sendMessage(): void {
    const text = this.inputText().trim();
    if (!text || this.isLoading()) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    this.messages.update((msgs) => [...msgs, userMessage]);
    this.inputText.set('');
    this.isLoading.set(true);

    this.chatbotService.sendMessage(text, this.sessionId()).subscribe({
      next: (response) => {
        const botMessage: ChatMessage = { role: 'model', content: response.reply };
        this.messages.update((msgs) => [...msgs, botMessage]);
        this.isLoading.set(false);
        if (!this.isOpen()) {
          this.hasNewMessage.set(true);
        }
      },
      error: () => {
        const errorMessage: ChatMessage = {
          role: 'model',
          content: 'LytroBot could not process that request. Please try again.',
        };
        this.messages.update((msgs) => [...msgs, errorMessage]);
        this.isLoading.set(false);
      },
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  clearChat(): void {
    const currentSessionId = this.sessionId();

    this.chatbotService.clearHistory(currentSessionId).subscribe({
      next: () => {
        this.messages.set([]);
      },
      error: () => {
        this.messages.set([]);
      },
    });
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {}
  }

  private focusInput(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.messageInput?.nativeElement?.focus();
    } catch {}
  }

  private loadHistory(): void {
    const currentSessionId = this.sessionId();
    if (!currentSessionId) {
      return;
    }

    this.chatbotService.getHistory(currentSessionId).subscribe({
      next: (response) => {
        this.messages.set(Array.isArray(response.messages) ? response.messages : []);
      },
      error: () => {
        this.messages.set([]);
      },
    });
  }

  private generateSessionId(): string {
    const browserCrypto = globalThis.crypto;
    if (browserCrypto && typeof browserCrypto.randomUUID === 'function') {
      return browserCrypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

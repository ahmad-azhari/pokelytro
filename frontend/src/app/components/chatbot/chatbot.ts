import { Component, signal, computed, ViewChild, ElementRef, AfterViewChecked, PLATFORM_ID, inject } from '@angular/core';
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
export class Chatbot implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  private chatbotService = inject(ChatbotService);
  private platformId = inject(PLATFORM_ID);

  isOpen = signal(false);
  messages = signal<ChatMessage[]>([]);
  inputText = signal('');
  isLoading = signal(false);
  hasNewMessage = signal(false);

  messageCount = computed(() => this.messages().length);

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

    this.chatbotService.sendMessage(text, this.messages()).subscribe({
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
          content: 'Sorry, I encountered an error. Please try again!',
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
    this.messages.set([]);
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
}

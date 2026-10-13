
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  activePage = 'Overview';
  question = '';
  pendingRequests = 0;

  get loading(): boolean {
    return this.pendingRequests > 0;
  }

  stats = [
    { title: 'Total Farmers', value: '—', icon: '♙', note: 'Registered farmers' },
    { title: 'Sugarcane Supplied', value: '—', icon: '🌿', note: 'Total tonnes' },
    { title: 'Amount Paid', value: '—', icon: '₹', note: 'Payments completed' },
    { title: 'Pending Payments', value: '—', icon: '◷', note: 'Awaiting payment' }
  ];

  messages: { role: string; text: string }[] = [
    {
      role: 'assistant',
      text: 'Namaste! I am your Sugarcane AI Assistant. Ask me about farmer records, sugarcane supply, or payments.'
    }
  ];

  suggestions = [
    'How many farmers are registered?',
    'Who supplied the most sugarcane?',
    'Which farmers have pending payments?',
    'What is the total amount paid?'
  ];

  selectPage(page: string): void {
    this.activePage = page;
  }

  async askQuestion(suggestedQuestion?: string): Promise<void> {
    const userQuestion = (suggestedQuestion ?? this.question).trim();

    if (!userQuestion) return;

    this.messages.push({ role: 'user', text: userQuestion });
    const assistantMessage = { role: 'assistant', text: 'Thinking...' };
    this.messages.push(assistantMessage);
    this.question = '';
    this.pendingRequests++;

    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userQuestion })
      });

      if (!response.ok) throw new Error('Backend unavailable');

      if (!response.body) throw new Error('Streaming response unavailable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (assistantMessage.text === 'Thinking...') assistantMessage.text = '';
        assistantMessage.text += chunk;
      }

      const remainingText = decoder.decode();
      if (assistantMessage.text === 'Thinking...') assistantMessage.text = '';
      assistantMessage.text += remainingText;
      if (!assistantMessage.text) assistantMessage.text = 'No answer was returned.';
    } catch {
      assistantMessage.text = 'I could not get an answer. Please check the backend and try again.';
    } finally {
      this.pendingRequests--;
    }
  }
}

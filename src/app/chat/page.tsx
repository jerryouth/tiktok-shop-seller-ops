import type { Metadata } from 'next';
import { AiChatPage } from '@/components/ai-chat';

export const metadata: Metadata = {
  title: 'AI 选品 · 老K - TikTok Shop 选品运营',
};

export default function ChatPage() {
  return <AiChatPage />;
}

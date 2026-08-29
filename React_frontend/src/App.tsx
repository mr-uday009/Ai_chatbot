import { useState, useRef, useEffect, useCallback } from 'react';
import { Menu, X, Bot, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SystemStatusPanel } from '@/components/SystemStatusPanel';
import { ChatMessageItem, TypingIndicator, EmptyState } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import {
  sendChat,
  getSystemStatus,
  checkHealth,
  type ChatMessage,
  type ChatHistoryEntry,
  type SystemStatus,
} from '@/lib/api';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const health = await checkHealth();
      setBackendOnline(health.success && health.status === 'UP');
    } catch (err) {
      setBackendOnline(false);
      setStatusError(err instanceof Error ? err.message : 'Failed to reach the backend.');
      setStatusLoading(false);
      return;
    }
    try {
      const result = await getSystemStatus();
      setStatus(result);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to load system details.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || backendOnline === false) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const history: ChatHistoryEntry[] = [...messages, userMessage]
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await sendChat(text, history);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.answer ?? response.error ?? 'No response received.',
        data: response.data,
        type: response.type,
        error: !response.success,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred.',
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, backendOnline, messages]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const sidebar = (
    <SystemStatusPanel
      status={status}
      loading={statusLoading}
      error={statusError}
      onRefresh={refreshStatus}
      onClearChat={handleClearChat}
      db2Server={status?.db2.server ?? null}
    />
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-80 shrink-0 border-r bg-card/30 lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>System Status</SheetTitle>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open status panel"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-tight">
                  Mainframe Db2 Assistant
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={
                      'inline-flex h-1.5 w-1.5 rounded-full ' +
                      (backendOnline === null
                        ? 'bg-amber-500'
                        : backendOnline
                        ? 'bg-emerald-500'
                        : 'bg-red-500')
                    }
                  />
                  {backendOnline === null
                    ? 'Connecting...'
                    : backendOnline
                    ? 'Online'
                    : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 && !loading ? (
            <EmptyState />
          ) : (
            <div className="mx-auto max-w-3xl">
              {messages.map((msg, idx) => (
                <ChatMessageItem key={idx} message={msg} />
              ))}
              {loading && <TypingIndicator />}
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onStop={() => setLoading(false)}
          loading={loading}
          disabled={backendOnline === false}
        />
      </div>
    </div>
  );
}

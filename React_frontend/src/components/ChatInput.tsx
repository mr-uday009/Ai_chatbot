import { useRef, useEffect } from 'react';
import { SendHorizontal, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  loading: boolean;
  disabled: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  loading,
  disabled,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim() && !disabled) onSubmit();
    }
  };

  return (
    <div className="border-t bg-background/80 px-4 py-4 backdrop-blur-sm sm:px-6">
      <div
        className={cn(
          'mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-colors',
          disabled && 'opacity-60'
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled
              ? 'Backend offline — check the connection status.'
              : 'Ask about employee data... (e.g. "Show all employees")'
          }
          className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {loading ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={onStop}
            className="h-9 w-9 shrink-0 rounded-xl"
            aria-label="Stop generating"
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            className="h-9 w-9 shrink-0 rounded-xl"
            aria-label="Send message"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
        Press Enter to send · Shift+Enter for a new line · Read-only access to Db2
      </p>
    </div>
  );
}

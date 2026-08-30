import { useState } from 'react';
import {
  User,
  Bot,
  Database,
  ChevronDown,
  ChevronUp,
  Table2,
  CircleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/api';

function MessageAvatar({ role }: { role: ChatMessage['role'] }) {
  const isUser = role === 'user';
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      )}
    >
      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  );
}

function DataTable({ rows }: { rows: ChatMessage['data'] }) {
  const [expanded, setExpanded] = useState(true);
  if (!rows || rows.length === 0) return null;

  const columns = Object.keys(rows[0]).filter((key) =>
    rows.some((row) => row[key as keyof typeof row] != null)
  );

  const previewCount = 5;
  const visibleRows = expanded ? rows : rows.slice(0, previewCount);
  const hiddenCount = rows.length - previewCount;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          <Table2 className="h-3.5 w-3.5" />
          {rows.length} {rows.length === 1 ? 'record' : 'records'}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {columns.length} {columns.length === 1 ? 'column' : 'columns'}
          </span>
        </span>
        {rows.length > previewCount && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {expanded ? (
              <>
                Show less <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                {hiddenCount} more <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </span>
        )}
      </button>
      <div className="max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => {
                  const value = row[col as keyof typeof row];
                  return (
                    <TableCell key={col} className="whitespace-nowrap font-mono text-xs">
                      {value == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        String(value)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface ChatMessageItemProps {
  message: ChatMessage;
}

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === 'user';
  const isError = message.error;

  return (
    <div
      className={cn(
        'flex w-full gap-3 px-4 py-5 sm:px-6',
        isUser ? 'bg-transparent' : 'bg-muted/20'
      )}
    >
      <MessageAvatar role={message.role} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {isUser ? 'You' : 'Assistant'}
          </span>
          {message.type && message.type !== 'text' && (
            <Badge variant="secondary" className="text-[10px] uppercase">
              {message.type}
            </Badge>
          )}
        </div>
        <div
          className={cn(
            'text-sm leading-relaxed',
            isError && 'text-red-600 dark:text-red-400'
          )}
        >
          {message.content.split('\n').map((line, i) => (
            <p key={i} className={line.trim() === '' ? 'h-4' : ''}>
              {line}
            </p>
          ))}
        </div>
        {message.data && message.data.length > 0 && (
          <DataTable rows={message.data} />
        )}
        {message.data && message.data.length === 0 && !isError && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            Query returned no matching records.
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex w-full gap-3 bg-muted/20 px-4 py-5 sm:px-6">
      <MessageAvatar role="assistant" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Assistant</span>
        <div className="flex items-center gap-1.5 py-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
        </div>
      </div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Bot className="h-8 w-8" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">
          Mainframe Db2 Assistant
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Ask questions about employee data in natural language. The assistant
          translates your request into a safe SQL query and returns the results
          from Db2.
        </p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Badge variant="outline" className="gap-1.5">
          <Database className="h-3 w-3" /> Db2
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <CircleAlert className="h-3 w-3" /> Read-only
        </Badge>
      </div>
    </div>
  );
}

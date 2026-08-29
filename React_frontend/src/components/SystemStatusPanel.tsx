import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Database,
  Server,
  Cpu,
  Lock,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { SystemStatus } from '@/lib/api';

interface ServiceRow {
  name: string;
  status: string;
  icon: React.ReactNode;
}

function statusTone(status: string): 'up' | 'down' | 'unknown' {
  const s = status.toUpperCase();
  if (s === 'UP' || s === 'AVAILABLE' || s === 'CONNECTED') return 'up';
  if (s === 'DOWN' || s === 'UNAVAILABLE') return 'down';
  return 'unknown';
}

const toneStyles: Record<
  'up' | 'down' | 'unknown',
  { dot: string; text: string; bg: string }
> = {
  up: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  down: {
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10',
  },
  unknown: {
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
  },
};

function overallTone(
  overall: SystemStatus['overall']
): 'up' | 'down' | 'unknown' {
  if (overall === 'UP') return 'up';
  if (overall === 'DOWN') return 'down';
  return 'unknown';
}

interface SystemStatusPanelProps {
  status: SystemStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClearChat: () => void;
  db2Server: string | null;
}

export function SystemStatusPanel({
  status,
  loading,
  error,
  onRefresh,
  onClearChat,
  db2Server,
}: SystemStatusPanelProps) {
  const services: ServiceRow[] = status
    ? [
        { name: 'Node.js', status: status.nodejs.status, icon: <Server className="h-4 w-4" /> },
        { name: 'NVIDIA API', status: status.nvidia.status, icon: <Cpu className="h-4 w-4" /> },
        { name: 'Java DB2 API', status: status.javaApi.status, icon: <Activity className="h-4 w-4" /> },
        { name: 'Db2 Subsystem', status: status.db2.status, icon: <Database className="h-4 w-4" /> },
      ]
    : [];

  const overall = status ? overallTone(status.overall) : 'unknown';
  const overallToneStyle = toneStyles[overall];

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">
            System Status
          </span>
          <span
            className={cn(
              'inline-flex h-2 w-2 rounded-full',
              overallToneStyle.dot
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Live health of the mainframe backend services.
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={loading}
        className="w-full justify-start gap-2"
      >
        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        {loading ? 'Checking connection...' : 'Check connection'}
      </Button>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {status
          ? services.map((service) => {
              const tone = statusTone(service.status);
              const style = toneStyles[tone];
              const Icon =
                tone === 'up'
                  ? CheckCircle2
                  : tone === 'down'
                  ? XCircle
                  : AlertTriangle;
              return (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md',
                        style.bg
                      )}
                    >
                      {service.icon}
                    </span>
                    <span className="text-sm font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', style.text)} />
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wide',
                        style.text
                      )}
                    >
                      {service.status}
                    </span>
                  </div>
                </div>
              );
            })
          : Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="ml-auto h-3 w-12 animate-pulse rounded bg-muted" />
              </div>
            ))}
      </div>

      {status && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            Db2 Server
          </span>
          <Badge variant="secondary" className="font-mono">
            {db2Server ?? status.db2.server ?? 'Unknown'}
          </Badge>
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4" />
          Security
        </span>
        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            SELECT-only database access
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            LLM has no direct Db2 access
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Java API validates queries
          </li>
        </ul>
      </div>

      <div className="mt-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearChat}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
          Clear chat
        </Button>
      </div>
    </div>
  );
}

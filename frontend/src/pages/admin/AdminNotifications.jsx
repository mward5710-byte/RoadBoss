import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MessageSquare, Mail, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';

const statusBadge = (status) => {
  if (!status) return <Badge variant="secondary">unknown</Badge>;
  const s = status.toLowerCase();
  if (['delivered', 'sent', 'queued'].includes(s)) return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40" data-testid={`status-${s}`}>{s}</Badge>;
  if (['failed', 'undelivered', 'bounced', 'invalid_phone', 'invalid_email'].some(x => s.includes(x))) return <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40" data-testid={`status-failed`}>{s}</Badge>;
  if (s === 'skipped') return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40" data-testid={`status-skipped`}>{s}</Badge>;
  return <Badge variant="secondary" data-testid={`status-${s}`}>{s}</Badge>;
};

export default function AdminNotifications() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications/logs?limit=200');
      setLogs(data || []);
    } catch (err) {
      toast.error('Could not load notification logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = logs.filter(l => {
    if (tab === 'sms' && l.channel !== 'sms') return false;
    if (tab === 'inbound' && l.channel !== 'sms_inbound') return false;
    if (tab === 'email' && l.channel !== 'email') return false;
    if (tab === 'failed' && !['failed', 'undelivered', 'bounced'].includes((l.status || '').toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (l.to || '').toLowerCase().includes(q) ||
        (l.from || '').toLowerCase().includes(q) ||
        (l.subject || '').toLowerCase().includes(q) ||
        (l.body || '').toLowerCase().includes(q) ||
        (l.event_type || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: logs.length,
    sms: logs.filter(l => l.channel === 'sms').length,
    inbound: logs.filter(l => l.channel === 'sms_inbound').length,
    email: logs.filter(l => l.channel === 'email').length,
    failed: logs.filter(l => ['failed', 'undelivered', 'bounced'].includes((l.status || '').toLowerCase())).length,
  };

  return (
    <div className="p-8 space-y-6" data-testid="admin-notifications-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-400 font-semibold">FLEET COMMAND CENTER</div>
          <h1 className="text-2xl font-bold text-white mt-1">Notifications</h1>
          <p className="text-sm text-zinc-400 mt-1">Audit log for every SMS and email RoadBoss has sent or received on behalf of your fleet.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading} data-testid="refresh-notifications-btn">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4">
          <div className="text-xs text-zinc-400 uppercase tracking-wide">Total</div>
          <div className="text-2xl font-bold text-white mt-1" data-testid="stat-total">{stats.total}</div>
        </CardContent></Card>
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4">
          <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1"><MessageSquare className="h-3 w-3" /> SMS Out</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1" data-testid="stat-sms">{stats.sms}</div>
        </CardContent></Card>
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4">
          <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Replies In</div>
          <div className="text-2xl font-bold text-violet-400 mt-1" data-testid="stat-inbound">{stats.inbound}</div>
        </CardContent></Card>
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4">
          <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1"><Mail className="h-3 w-3" /> Email</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1" data-testid="stat-email">{stats.email}</div>
        </CardContent></Card>
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4">
          <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Failed</div>
          <div className="text-2xl font-bold text-rose-400 mt-1" data-testid="stat-failed">{stats.failed}</div>
        </CardContent></Card>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-white">Audit Log</CardTitle>
            <Input
              placeholder="Search by recipient, subject, body, event type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm bg-zinc-950 border-zinc-700 text-zinc-200"
              data-testid="notifications-search"
            />
          </div>
          <Tabs value={tab} onValueChange={setTab} className="mt-3">
            <TabsList className="bg-zinc-950">
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="sms" data-testid="tab-sms">SMS Out</TabsTrigger>
              <TabsTrigger value="inbound" data-testid="tab-inbound">Replies In</TabsTrigger>
              <TabsTrigger value="email" data-testid="tab-email">Email</TabsTrigger>
              <TabsTrigger value="failed" data-testid="tab-failed">Failed</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-zinc-500" data-testid="loading-state">
              <Clock className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading notification log...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-500" data-testid="empty-state">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <div>No notifications match the current filter.</div>
              <div className="text-xs mt-1">Trigger a crash event, dispatch SMS, or password reset to populate this log.</div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((log) => {
                const isInbound = log.channel === 'sms_inbound';
                const isEmail = log.channel === 'email';
                return (
                <div key={log.id} className="py-3 flex items-start gap-3" data-testid={`notification-row-${log.id}`}>
                  <div className="flex-shrink-0 mt-1">
                    {isEmail ? (
                      <Mail className="h-4 w-4 text-emerald-400" />
                    ) : isInbound ? (
                      <MessageSquare className="h-4 w-4 text-violet-400" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-cyan-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isInbound ? (
                        <>
                          <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40 text-[10px]">INBOUND</Badge>
                          <span className="text-sm font-medium text-white">{log.from || '(unknown)'}</span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-white">{log.to}</span>
                      )}
                      <Badge variant="outline" className="text-[10px] uppercase border-zinc-700 text-zinc-400">
                        {log.event_type || 'transactional'}
                      </Badge>
                      {statusBadge(log.status)}
                    </div>
                    <div className="text-sm text-zinc-300 mt-1 line-clamp-2">
                      {log.subject || log.body || '(no content)'}
                    </div>
                    {log.error && (
                      <div className="text-xs text-rose-400 mt-1" data-testid="notification-error">
                        ⚠ {log.error}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-zinc-500">{new Date(log.created_at).toLocaleString()}</div>
                    {log.provider_message_id && (
                      <div className="text-[10px] text-zinc-600 font-mono">{log.provider_message_id.slice(0, 12)}...</div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

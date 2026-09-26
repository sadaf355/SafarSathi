import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/ToastProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { suggestedPrompts } from '@/data/mockData';
import * as api from '@/services/api';
import type { ChatMessage, RecoveryOption } from '@/types';
import { Sparkles, X, Send, Check, ShieldCheck, ArrowRight, Wallet, Clock } from 'lucide-react';

interface SathiPageProps { open?: boolean; overlay?: boolean; onClose: () => void; }
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function SathiPage({ open = true, overlay = false, onClose }: SathiPageProps) {
  const { tripId, trip, activeDisruption, recoveryOptions, applyRecoveryPlan } = useApp();
  const { addToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 'welcome', role: 'assistant', content: `Hi! I’m Sathi. I can explain your journey, identify what is at risk, and propose a recovery when something goes wrong.`, timestamp: now() }]);
  const [input, setInput] = useState(''); const [thinking, setThinking] = useState(false); const [confirm, setConfirm] = useState<RecoveryOption | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestedAction = useMemo(() => recoveryOptions.filter(o=>o.feasible !== false).sort((a,b)=>b.score-a.score)[0] ?? null, [recoveryOptions]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, thinking]);
  useEffect(() => { if (!open) return; const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h); },[open,onClose]);
  if (!open) return null;

  const send = async (text: string) => {
    if (!text.trim() || thinking) return;
    setMessages(m=>[...m,{id:`u-${Date.now()}`,role:'user',content:text,timestamp:now()}]); setInput(''); setThinking(true);
    try { const answer=await api.askAssistant(tripId,text); setMessages(m=>[...m,{id:`a-${Date.now()}`,role:'assistant',content:answer.content,timestamp:now(),references:answer.references}]); }
    catch { setMessages(m=>[...m,{id:`e-${Date.now()}`,role:'assistant',content:'I can’t reach the travel intelligence service right now. Your current trip state is still available.',timestamp:now()}]); }
    finally { setThinking(false); }
  };
  const apply = async () => { if(!confirm) return; try { await applyRecoveryPlan(confirm.id); addToast('success','Journey recovered',`${confirm.bookingsPreserved}/${confirm.totalBookings} commitments preserved.`); setConfirm(null); } catch { addToast('error','Recovery could not be applied','Please review the recovery center and try again.'); } };

  const content = <div className={cn(overlay ? 'fixed inset-y-0 right-0 z-[150] w-full max-w-xl border-l border-slate-200 bg-white shadow-2xl animate-slide-in-right' : '')}>
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-safar-ai/5 text-safar-ai"><Sparkles className="h-4 w-4"/></div><div><div className="text-sm font-bold text-slate-900">Sathi AI</div><div className="text-[11px] text-slate-500">Ask when you need clarity. Act when you need help.</div></div></div>{overlay && <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close Sathi"><X className="h-5 w-5"/></button>}</div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {!overlay && <PageHeader title="Sathi AI" description="Your travel companion for questions, explanations and recovery decisions." crumbs={['Home','Sathi AI']} onNavigate={(page) => onClose()} />}
        <div className="space-y-4">
          {messages.map(m=><Bubble key={m.id} message={m} />)}
          {thinking && <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-7 w-7 rounded-lg bg-safar-ai/5"/><span className="inline-flex gap-1 rounded-xl bg-safar-ai/5 px-3 py-2 text-safar-ai"><i className="h-1.5 w-1.5 animate-typing rounded-full bg-safar-ai"/><i className="h-1.5 w-1.5 animate-typing rounded-full bg-safar-ai [animation-delay:150ms]"/><i className="h-1.5 w-1.5 animate-typing rounded-full bg-safar-ai [animation-delay:300ms]"/></span></div>}
          {messages.length === 1 && <div className="grid gap-2">{suggestedPrompts.slice(0,4).map(p=><button key={p} onClick={()=>send(p)} className="rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm transition hover:border-safar-blue/30 hover:bg-slate-50"><span className="mr-2 text-safar-blue">→</span>{p}</button>)}</div>}
          {activeDisruption && suggestedAction && <ActionCard option={suggestedAction} onReview={()=>setConfirm(suggestedAction)} />}
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white p-4"><div className="flex items-end gap-2"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input);}}} rows={1} placeholder="Ask Sathi about your journey..." className="min-h-11 flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-safar-blue focus:outline-none"/><button onClick={()=>send(input)} disabled={!input.trim()||thinking} className="flex h-11 w-11 items-center justify-center rounded-xl bg-safar-blue text-white disabled:opacity-40" aria-label="Send"><Send className="h-4 w-4"/></button></div></div>
    </div>
    <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Confirm recovery" subtitle="Sathi will not apply changes without your approval.">
      {confirm && (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">{confirm.name}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <span>Additional cost <b className="block text-slate-900">₹{confirm.costDelta.toLocaleString('en-IN')}</b></span>
              <span>Time impact <b className="block text-slate-900">{confirm.timeImpactMinutes} min</b></span>
              <span>Preserved <b className="block text-slate-900">{confirm.bookingsPreserved}/{confirm.totalBookings}</b></span>
              <span>Residual risk <b className="block text-safar-safe">{confirm.residualRisk}</b></span>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safar-blue/40 focus-visible:ring-offset-2">Cancel</button>
            <button type="button" onClick={apply} className="flex-1 rounded-xl bg-safar-blue py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safar-blue/40 focus-visible:ring-offset-2">Confirm & Apply</button>
          </div>
        </>
      )}
    </Modal>
  </div>;
  return overlay ? <div className="fixed inset-0 z-[149] bg-safar-navy/10" onClick={onClose}>{<div onClick={e=>e.stopPropagation()}>{content}</div>}</div> : content;
}

function Bubble({message}:{message:ChatMessage}) { const user=message.role==='user'; return <div className={cn('flex gap-2.5',user&&'justify-end')}><div className={cn('max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6',user?'bg-safar-blue text-white':'ai-surface text-slate-800')}><div className="mb-1 text-[10px] font-semibold tracking-wide">{user?'YOU':'✦ SAFARSATHI INSIGHT'}</div>{message.content}<div className={cn('mt-2 text-[9px]',user?'text-blue-100':'text-safar-ai')}>{message.timestamp}</div></div></div>; }
function ActionCard({option,onReview}:{option:RecoveryOption;onReview:()=>void}) { return <div className="ai-surface rounded-2xl p-4"><div className="flex items-center gap-2 text-safar-ai"><Sparkles className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-wider">Sathi can act</span></div><div className="mt-2 text-sm font-bold text-slate-900">Apply: {option.name}</div><p className="mt-1 text-xs text-slate-600">{option.description}</p><div className="mt-3 flex flex-wrap gap-3 text-xs"><span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5"/>₹{option.costDelta.toLocaleString('en-IN')}</span><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5"/>+{option.timeImpactMinutes}m</span><span className="flex items-center gap-1 text-safar-safe"><Check className="h-3.5 w-3.5"/>{option.bookingsPreserved}/{option.totalBookings} preserved</span></div><button onClick={onReview} className="mt-4 flex items-center gap-2 rounded-xl bg-safar-blue px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safar-blue/40 focus-visible:ring-offset-2">Review & confirm <ArrowRight className="h-3.5 w-3.5"/></button></div>; }

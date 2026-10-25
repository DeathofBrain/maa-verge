import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { rpc, type RpcParams, type RpcResult } from '@maaverge/contracts';
import './operator-badge.css';

type Client = RpcParams<'resources.operator'>['clientType'];
type Operator = RpcResult<'resources.operator'>;
const portraits = new Map<string, Promise<Operator>>();

export function readOperator(key: string, name: string, clientType: Client, operatorId?: string): Promise<Operator> {
  const previous = portraits.get(key);
  if (previous) return previous;
  const request = rpc('resources.operator', { name, clientType, operatorId });
  portraits.set(key, request);
  if (portraits.size > 256) portraits.delete(portraits.keys().next().value!);
  void request.catch(() => { if (portraits.get(key) === request) portraits.delete(key); });
  return request;
}

export default function OperatorBadge({ name, resourceKey, clientType, operatorId }: { name: string; resourceKey: string; clientType?: Client; operatorId?: string }) {
  const key = JSON.stringify([resourceKey, clientType ?? 'Official', operatorId ?? name]);
  const [loaded, setLoaded] = useState<{ key: string; operator: Operator }>();
  const [brokenImage, setBrokenImage] = useState('');
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => { void readOperator(key, name, clientType, operatorId).then((operator) => { if (!cancelled) setLoaded({ key, operator }); }, () => { /* Keep the fixed fallback. */ }); };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '160px' });
    if (element.current) observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [key, name, clientType, operatorId]);
  const operator = loaded?.key === key ? loaded.operator : undefined;
  const rarity = operator?.rarity;
  const src = operator?.mimeType && operator.data && brokenImage !== key ? `data:${operator.mimeType};base64,${operator.data}` : null;
  return <span ref={element} className={`operator-badge rarity-${rarity ?? 'unknown'}`} title={rarity ? `${name} · ${rarity} 星` : name}>
    <span className="operator-avatar">{src ? <img loading="lazy" src={src} alt={`${name}头像`} onError={() => setBrokenImage(key)} /> : <UserRound size={22} aria-hidden="true" />}</span>
    <span className="operator-identity"><strong>{name}</strong>{rarity ? <small>{rarity} 星</small> : null}</span>
  </span>;
}

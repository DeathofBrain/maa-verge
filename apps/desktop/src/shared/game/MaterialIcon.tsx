// 按资源代际、客户端和物品缓存图标请求，读取失败时保留通用占位图。
import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { rpc, type RpcParams } from '@maaverge/contracts';
import './material-icon.css';

type Client = RpcParams<'resources.item'>['clientType'];
const images = new Map<string, Promise<string | null>>();

function readIcon(key: string, itemId: string, clientType: Client): Promise<string | null> {
  // 缓存 Promise 同时合并并发请求；失败后移除当前请求，允许后续重试。
  const previous = images.get(key);
  if (previous) return previous;
  const request = rpc('resources.item', { itemId, clientType }).then((item) =>
    item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : null,
  );
  images.set(key, request);
  if (images.size > 256) images.delete(images.keys().next().value!);
  void request.catch(() => {
    if (images.get(key) === request) images.delete(key);
  });
  return request;
}

export default function MaterialIcon({
  itemId,
  name,
  clientType,
  resourceKey,
  className = '',
}: {
  itemId: string;
  name: string;
  clientType?: Client;
  resourceKey: string;
  className?: string;
}) {
  const key = JSON.stringify([resourceKey, clientType ?? 'Official', itemId]);
  const [loaded, setLoaded] = useState<{ key: string; url: string | null }>();
  useEffect(() => {
    let cancelled = false;
    void readIcon(key, itemId, clientType).then(
      (url) => {
        if (!cancelled) setLoaded({ key, url });
      },
      () => {
        if (!cancelled) setLoaded({ key, url: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, itemId, clientType]);
  // 切换物品或资源代际后，旧请求的缓存结果不能短暂显示成新图标。
  const url = loaded?.key === key ? loaded.url : null;
  return (
    <span className={`material-icon ${className}`}>
      {url ? (
        <img src={url} alt={name} onError={() => setLoaded({ key, url: null })} />
      ) : (
        <Package size={19} aria-hidden="true" />
      )}
    </span>
  );
}

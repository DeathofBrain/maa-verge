import { useEffect, useState } from 'react';
import { errorMessage, rpc, subscribe } from '@maaverge/contracts';
import './schedule-panel.css';
export default function ScheduleNotifications() {
  const [items, setItems] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled=false;
    const refresh=()=>{void rpc('schedule.list',{}).then(data=>{if(!cancelled)setItems(data.occurrences.filter(item=>['countdown','stopping','starting'].includes(String(item.status))));},()=>{});};
    refresh();const unsubscribe=subscribe(event=>{if(event.type==='schedule.notice')setNotice(event.message);if(event.type.startsWith('schedule.'))refresh();});
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>{cancelled=true;unsubscribe();window.clearInterval(timer);};
  },[]);
  return <aside className="schedule-notifications" aria-label="定时通知">{notice&&<section role="status"><p>{notice}</p><button className="button secondary" onClick={()=>setNotice('')}>关闭通知</button></section>}{items.map(item=><section role="alert" key={item.id}><strong>{item.status==='countdown'?`强制定时将在 ${Math.max(0,Math.ceil((Number(item.countdownUntil)-now)/1000))} 秒后启动`:'正在等待设备安全结束并准备定时任务'}</strong><p>将执行此定时绑定的任务表与设备。</p><button className="button secondary" disabled={item.startCommitted===true} onClick={()=>{void rpc('schedule.cancel',{id:String(item.id)}).then(result=>{if(result.cancelled){setItems(previous=>previous.filter(value=>value.id!==item.id));setError('');}else setError('本次定时已进入启动阶段，请在执行页查看或停止。');},cause=>setError(errorMessage(cause)));}}>取消本次定时</button></section>)}{error&&<p role="alert">{error}</p>}</aside>;
}

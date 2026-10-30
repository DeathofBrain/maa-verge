import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { errorMessage, rpc, type Settings } from '@maaverge/contracts';
import Button from '@/kit/Button';
import IconButton from '@/kit/IconButton';
import TextField from '@/kit/TextField';

type Line = NonNullable<Settings['infrastructureEstimates']>[number]['lines'][number];
type Lines = NonNullable<Settings['infrastructureEstimates']>[number]['lines'];
type LineDraft = {
  id: string;
  name: string;
  unit: string;
  hourlyRate: string;
  capacity: string;
  collected: string;
};

const localInput = (value: string) => {
  const at = new Date(value);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function InfrastructureEditor({
  deviceId,
  settings,
  onSaved,
}: {
  deviceId: string;
  settings: Settings;
  onSaved: () => void;
}) {
  const saved =
    settings.infrastructureEstimates?.find((profile) => profile.deviceId === deviceId)?.lines || [];
  const drafts = (lines: Line[]) =>
    lines.map((line) => ({
      id: line.id,
      name: line.name,
      unit: line.unit,
      hourlyRate: String(line.hourlyRate),
      capacity: String(line.capacity),
      collected: localInput(line.lastCollectedAt),
    }));
  const [lines, setLines] = useState<LineDraft[]>(() => drafts(saved));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const patch = (id: string, value: Partial<LineDraft>) => {
    setLines((previous) => previous.map((line) => (line.id === id ? { ...line, ...value } : line)));
    setMessage('');
  };
  const submit = async () => {
    if (pending) return;
    setError('');
    setMessage('');
    const values: Line[] = [];
    if (lines.length > 20) {
      setError('每台设备最多配置 20 条产线。');
      return;
    }
    for (const line of lines) {
      const collected = Date.parse(line.collected),
        hourlyRate = Number(line.hourlyRate),
        capacity = Number(line.capacity);
      if (
        !line.name.trim() ||
        !line.unit.trim() ||
        line.hourlyRate === '' ||
        line.capacity === '' ||
        !Number.isFinite(hourlyRate) ||
        hourlyRate < 0 ||
        hourlyRate > 1e9 ||
        !Number.isFinite(capacity) ||
        capacity <= 0 ||
        capacity > 1e9 ||
        !Number.isFinite(collected) ||
        collected > Date.now()
      ) {
        setError('请填写名称、单位、非负速率、正数容量和不晚于现在的收取时间。');
        return;
      }
      values.push({
        id: line.id,
        name: line.name.trim(),
        unit: line.unit.trim(),
        hourlyRate,
        capacity,
        lastCollectedAt: new Date(collected).toISOString(),
      });
    }
    setPending(true);
    try {
      await rpc('settings.save', {
        settings: {
          ...settings,
          infrastructureEstimates: [
            ...(settings.infrastructureEstimates || []).filter(
              (profile) => profile.deviceId !== deviceId,
            ),
            { deviceId, lines: values as Lines },
          ],
        },
      });
      setMessage('此设备的估算配置已保存');
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <details className="game-estimate-editor">
      <summary>配置此设备的产线估算</summary>
      <p>
        从上次收取后的空仓开始，按固定速率累积并在容量处封顶。干员心情、加成、订单完成和停工都会使实际结果不同；收取后请手动更新基准时间。
      </p>
      <fieldset disabled={pending}>
        {lines.map((line, index) => (
          <div className="game-line-form" key={line.id}>
            <div className="game-line-title">
              <strong>产线 {index + 1}</strong>
              <IconButton
                label={`删除产线 ${index + 1}`}
                onClick={() =>
                  setLines((previous) => previous.filter((item) => item.id !== line.id))
                }
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
            <label>
              名称
              <TextField
                className="game-line-input"
                aria-label={`产线 ${index + 1} 名称`}
                maxLength={80}
                value={line.name}
                placeholder="例如：制造站 1 · 赤金"
                onChange={(event) => patch(line.id, { name: event.target.value })}
              />
            </label>
            <div className="game-line-numbers">
              <label>
                每小时产量
                <TextField
                  className="game-line-input"
                  aria-label={`产线 ${index + 1} 每小时产量`}
                  type="number"
                  min="0"
                  max="1000000000"
                  step="any"
                  value={line.hourlyRate}
                  onChange={(event) => patch(line.id, { hourlyRate: event.target.value })}
                />
              </label>
              <label>
                容量
                <TextField
                  className="game-line-input"
                  aria-label={`产线 ${index + 1} 容量`}
                  type="number"
                  min="0.000001"
                  max="1000000000"
                  step="any"
                  value={line.capacity}
                  onChange={(event) => patch(line.id, { capacity: event.target.value })}
                />
              </label>
              <label>
                单位
                <TextField
                  className="game-line-input"
                  aria-label={`产线 ${index + 1} 单位`}
                  maxLength={20}
                  value={line.unit}
                  onChange={(event) => patch(line.id, { unit: event.target.value })}
                />
              </label>
            </div>
            <label>
              上次收取时间（本机时间）
              <TextField
                className="game-line-input"
                aria-label={`产线 ${index + 1} 上次收取时间`}
                type="datetime-local"
                value={line.collected}
                onChange={(event) => patch(line.id, { collected: event.target.value })}
              />
            </label>
            <Button
              className="game-line-add"
              variant="text"
              onClick={() => patch(line.id, { collected: localInput(new Date().toISOString()) })}
            >
              我刚已收取，设为现在
            </Button>
          </div>
        ))}
        <div className="game-editor-actions">
          <Button
            size="sm"
            disabled={lines.length >= 20}
            onClick={() =>
              setLines((previous) => [
                ...previous,
                {
                  id: crypto.randomUUID(),
                  name: '',
                  unit: '个',
                  hourlyRate: '',
                  capacity: '',
                  collected: '',
                },
              ])
            }
          >
            <Plus size={13} />
            添加产线
          </Button>
          <Button size="sm" variant="primary" onClick={() => void submit()}>
            {pending ? '保存中…' : '保存估算配置'}
          </Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="game-form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}

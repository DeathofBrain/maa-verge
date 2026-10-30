import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  errorMessage,
  rpc,
  RuntimeRequestError,
  type CopilotRecord,
  type RpcResult,
} from '@maaverge/contracts';

export default function CopilotRating({
  record,
  refreshKey,
  onSourceExpired,
}: {
  record: CopilotRecord;
  refreshKey: string;
  onSourceExpired: () => void;
}) {
  const [value, setValue] = useState<RpcResult<'copilot.rating.get'>>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const writing = useRef(false);
  const refreshPending = useRef(false);
  const expired = useRef(onSourceExpired);
  expired.current = onSourceExpired;
  const checkSource = (cause: unknown) => {
    if (
      cause instanceof RuntimeRequestError &&
      cause.code === -32602 &&
      cause.message.includes('作业来源已过期')
    )
      expired.current();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (writing.current) {
      refreshPending.current = true;
      return;
    }
    const request = ++sequence.current;
    setLoading(true);
    setLoadError('');
    void rpc('copilot.rating.get', { versionId: record.versionId, recordId: record.id })
      .then(
        (result) => {
          if (request === sequence.current) setValue(result);
        },
        (cause) => {
          if (request === sequence.current) {
            checkSource(cause);
            setLoadError(errorMessage(cause));
          }
        },
      )
      .finally(() => {
        if (request === sequence.current) setLoading(false);
      });
    return () => {
      sequence.current++;
    };
  }, [record.versionId, record.id, refreshKey, revision]);
  const rate = async (rating: 'like' | 'dislike') => {
    if (writing.current) return;
    writing.current = true;
    sequence.current++;
    setSubmitting(true);
    setLoading(false);
    setError('');
    setLoadError('');
    try {
      const result = await rpc('copilot.rating.set', {
        versionId: record.versionId,
        recordId: record.id,
        rating: value?.rating === rating ? 'none' : rating,
      });
      if (mounted.current) setValue(result);
    } catch (cause) {
      if (mounted.current) {
        checkSource(cause);
        setError(errorMessage(cause));
      }
    } finally {
      writing.current = false;
      if (mounted.current) {
        setSubmitting(false);
        if (refreshPending.current) {
          refreshPending.current = false;
          setRevision((previous) => previous + 1);
        }
      }
    }
  };
  return (
    <section className="cp-rating" aria-label="社区作业评价">
      <div className="cp-rating-controls">
        <span>作业评价</span>
        <button
          className="button secondary"
          aria-label="点赞作业"
          aria-pressed={value?.rating === 'like'}
          disabled={loading || submitting || !value}
          onClick={() => void rate('like')}
        >
          <ThumbsUp size={15} />
          {value?.rating === 'like' ? '已点赞' : '点赞'}
          {value && <span>{value.likes}</span>}
        </button>
        <button
          className="button secondary"
          aria-label="点踩作业"
          aria-pressed={value?.rating === 'dislike'}
          disabled={loading || submitting || !value}
          onClick={() => void rate('dislike')}
        >
          <ThumbsDown size={15} />
          {value?.rating === 'dislike' ? '已点踩' : '点踩'}
          {value && <span>{value.dislikes}</span>}
        </button>
        {(loading || submitting) && <LoaderCircle size={15} className="spin" />}
      </div>
      <p className="sp-help">
        评价会提交至 PRTS Plus；匿名评价按网络地址识别。点踩仅由你手动操作。
      </p>
      {(error || loadError) && (
        <div className="cp-rating-error" role="alert">
          <span>{error || loadError}</span>
          <button
            className="cp-link"
            disabled={loading || submitting}
            onClick={() => setRevision((previous) => previous + 1)}
          >
            重新读取评价
          </button>
        </div>
      )}
    </section>
  );
}

import Field from '@/kit/Field';
import Select from '@/kit/Select';
import TextArea from '@/kit/TextArea';
import TextField from '@/kit/TextField';

/** 将能力的参数 Schema 转为草稿并解析输入；最终权限及完整约束仍由宿主契约校验。 */
type Property = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  oneOf?: Property[];
  anyOf?: Property[];
};
export type InputDraft = Record<string, string>;
export function schemaProperties(schema: Record<string, unknown>): Record<string, Property> {
  return (schema.properties ?? {}) as Record<string, Property>;
}
export function initialInput(schema: Record<string, unknown>): InputDraft {
  return Object.fromEntries(
    Object.entries(schemaProperties(schema)).map(([name, property]) => [
      name,
      property.default === undefined
        ? ''
        : typeof property.default === 'string'
          ? property.default
          : JSON.stringify(property.default),
    ]),
  );
}
export function parseInput(
  schema: Record<string, unknown>,
  draft: InputDraft,
): Record<string, unknown> {
  const required = new Set((schema.required ?? []) as string[]);
  return Object.fromEntries(
    Object.entries(schemaProperties(schema)).flatMap(([name, property]) => {
      const raw = draft[name] ?? '';
      const label = property.title ?? name;
      if (!raw.trim()) {
        if (required.has(name)) throw new Error(`请填写${label}`);
        return [];
      }
      // 帧参数同时允许 current 与轻量 JSON 引用；只把显式对象文本解析成引用。
      const variants = property.oneOf ?? property.anyOf ?? [];
      const objectOrString =
        variants.some((variant) => variant.type === 'object') &&
        variants.some((variant) => variant.type === 'string');
      if (objectOrString && raw.trimStart().startsWith('{')) {
        try {
          return [[name, JSON.parse(raw)]];
        } catch {
          throw new Error(`${label}的格式无效`);
        }
      }
      if (
        property.type === 'string' ||
        (!property.type && (!property.enum || typeof property.enum[0] === 'string'))
      )
        return [[name, raw]];
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error(`${label}的格式无效`);
      }
      if (
        (property.type === 'integer' && !Number.isInteger(value)) ||
        (property.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) ||
        (property.type === 'boolean' && typeof value !== 'boolean') ||
        (property.type === 'array' && !Array.isArray(value)) ||
        (property.type === 'object' &&
          (!value || typeof value !== 'object' || Array.isArray(value)))
      )
        throw new Error(`${label}的类型无效`);
      if (
        typeof value === 'number' &&
        ((property.minimum !== undefined && value < property.minimum) ||
          (property.maximum !== undefined && value > property.maximum))
      )
        throw new Error(`${label}超出允许范围`);
      return [[name, value]];
    }),
  );
}

type Props = {
  schema: Record<string, unknown>;
  draft: InputDraft;
  disabled: boolean;
  onChange: (draft: InputDraft) => void;
};
export default function PrimitiveInputForm({ schema, draft, disabled, onChange }: Props) {
  const properties = Object.entries(schemaProperties(schema));
  const required = new Set((schema.required ?? []) as string[]);
  if (!properties.length) return <p className="debug-muted">此能力不需要参数。</p>;
  return (
    <div className="debug-fields">
      {properties.map(([name, property]) => {
        const value = draft[name] ?? '';
        const label = property.title ?? name;
        const change = (next: string) => onChange({ ...draft, [name]: next });
        return (
          <Field key={name} label={label} help={property.description}>
            {(id) =>
              property.enum ? (
                <Select
                  id={id}
                  aria-label={label}
                  value={value}
                  disabled={disabled}
                  onChange={(event) => change(event.target.value)}
                >
                  <option value="">请选择{required.has(name) ? '' : '（可选）'}</option>
                  {property.enum.map((option) => (
                    <option
                      key={JSON.stringify(option)}
                      value={typeof option === 'string' ? option : JSON.stringify(option)}
                    >
                      {String(option)}
                    </option>
                  ))}
                </Select>
              ) : property.type === 'boolean' ? (
                <Select
                  id={id}
                  aria-label={label}
                  value={value}
                  disabled={disabled}
                  onChange={(event) => change(event.target.value)}
                >
                  <option value="">请选择{required.has(name) ? '' : '（可选）'}</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </Select>
              ) : ['object', 'array'].includes(property.type ?? '') ? (
                <TextArea
                  id={id}
                  aria-label={label}
                  rows={3}
                  value={value}
                  disabled={disabled}
                  placeholder={property.type === 'array' ? '[]' : '{}'}
                  onChange={(event) => change(event.target.value)}
                />
              ) : (
                <TextField
                  id={id}
                  aria-label={label}
                  type={['number', 'integer'].includes(property.type ?? '') ? 'number' : 'text'}
                  step={property.type === 'integer' ? 1 : 'any'}
                  min={property.minimum}
                  max={property.maximum}
                  value={value}
                  disabled={disabled}
                  onChange={(event) => change(event.target.value)}
                />
              )
            }
          </Field>
        );
      })}
    </div>
  );
}

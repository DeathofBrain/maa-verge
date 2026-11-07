import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import type {
  AgentSkill,
  AgentSkillImportParams,
  AgentSkillSaveParams,
} from '@contracts/agent-types';
import { validateAgentSkill } from '@contracts/validators.js';
import { Store, now } from '@backend/infrastructure/storage/storage';
import { RpcError } from '@backend/shared/errors';

const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_REFERENCE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024;
const MAX_REFERENCES = 100;
const MAX_SKILLS = 100;
const textExtensions = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
const invalid = (message: string): never => {
  throw new RpcError(-32602, message);
};

function referenceName(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 240 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..') ||
    !textExtensions.has(path.posix.extname(value).toLowerCase()) ||
    !value.startsWith('references/')
  )
    invalid('技能引用必须是 references/ 下的相对文本资源名称');
  return value;
}

function parseSkill(content: string) {
  if (
    typeof content !== 'string' ||
    content.includes('\0') ||
    Buffer.byteLength(content) > MAX_CONTENT_BYTES
  )
    invalid('SKILL.md 超过 64 KiB 限制');
  const normalized = content.replace(/^\uFEFF/u, '').replaceAll('\r\n', '\n');
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(normalized);
  if (!frontmatter) return invalid('SKILL.md 必须包含 YAML frontmatter');
  const document = parseDocument(frontmatter[1], { uniqueKeys: true });
  if (document.errors.length) invalid('技能 frontmatter 不是有效且无重复键的 YAML');
  let metadata: unknown;
  try {
    metadata = document.toJS({ maxAliasCount: 0 });
  } catch {
    invalid('技能 frontmatter 不支持 YAML 别名');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    invalid('技能 frontmatter 必须为对象');
  const fields = metadata as Record<string, unknown>;
  const name = fields.name;
  const description = fields.description;
  if (typeof name !== 'string' || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name))
    invalid('技能 name 必须为不超过 64 字符的小写字母、数字和单连字符');
  if (typeof description !== 'string' || !description.trim() || description.length > 1024)
    invalid('技能 description 必须为 1 到 1024 字符的说明');
  if (
    fields.compatibility !== undefined &&
    (typeof fields.compatibility !== 'string' ||
      !fields.compatibility.length ||
      fields.compatibility.length > 500)
  )
    invalid('技能 compatibility 必须为不超过 500 字符的文本');
  if (fields['allowed-tools'] !== undefined && typeof fields['allowed-tools'] !== 'string')
    invalid('技能 allowed-tools 必须为空格分隔的工具名称');
  const allowedTools =
    typeof fields['allowed-tools'] === 'string'
      ? [...new Set(fields['allowed-tools'].trim().split(/\s+/u).filter(Boolean))]
      : [];
  if (
    allowedTools.length > 100 ||
    allowedTools.some((name) => !/^[a-zA-Z0-9_-]{1,64}$/u.test(name))
  )
    invalid('技能 allowed-tools 只支持已有工具的精确名称');
  return {
    name,
    description,
    allowedTools,
    restrictTools: Object.hasOwn(fields, 'allowed-tools'),
  } as {
    name: string;
    description: string;
    allowedTools: string[];
    restrictTools: boolean;
  };
}

/** 仅保存和导入文本 Skill；设置入口可导入本地资料，模型工具不获得脚本执行或目录访问权。 */
export class AgentSkills {
  constructor(private readonly store: Store) {}

  list(): { skills: AgentSkill[] } {
    return { skills: this.store.all<AgentSkill>('agent_skill') };
  }

  save(input: AgentSkillSaveParams): AgentSkill {
    const parsed = parseSkill(input.content);
    const previous = input.id
      ? this.store.get<AgentSkill | undefined>('agent_skill', input.id)
      : undefined;
    if (input.id && !previous) throw new RpcError(-32004, '技能不存在');
    const existing = this.list().skills;
    if (!previous && existing.length >= MAX_SKILLS) invalid('最多保存 100 个技能');
    if (existing.some((skill) => skill.name === parsed.name && skill.id !== previous?.id))
      invalid('已存在同名技能，请更新已有技能');
    const references = structuredClone(input.references ?? previous?.references ?? []);
    if (references.length > MAX_REFERENCES) invalid('技能引用文件超过 100 项');
    let total = Buffer.byteLength(input.content);
    const names = new Set<string>();
    for (const reference of references) {
      referenceName(reference.name);
      const normalized = reference.name.toLowerCase();
      if (names.has(normalized)) invalid('技能引用名称重复或存在大小写冲突');
      names.add(normalized);
      if (typeof reference.text !== 'string' || reference.text.includes('\0'))
        invalid('技能引用必须是文本');
      const bytes = Buffer.byteLength(reference.text);
      if (bytes > MAX_REFERENCE_BYTES) invalid('单个技能引用超过 64 KiB');
      total += bytes;
    }
    if (total > MAX_TOTAL_BYTES) invalid('技能内容与引用总计超过 512 KiB');
    // 引用顺序先规范化，再用正文和引用内容生成版本；旧版本留作轮次与审批证据。
    references.sort((a, b) => a.name.localeCompare(b.name));
    const version = createHash('sha256')
      .update(JSON.stringify({ content: input.content, references }))
      .digest('hex');
    const skill: AgentSkill = {
      id: previous?.id ?? randomUUID(),
      name: parsed.name,
      description: parsed.description,
      allowedTools: parsed.allowedTools,
      content: input.content,
      references,
      enabled: input.enabled ?? previous?.enabled ?? false,
      version,
      createdAt: previous?.createdAt ?? now(),
      updatedAt: now(),
    };
    if (!validateAgentSkill(skill)) invalid('技能不符合契约');
    this.store.transaction(() => {
      if (!this.store.get('agent_skill_version', `${skill.id}:${version}`))
        this.store.put('agent_skill_version', `${skill.id}:${version}`, skill);
      this.store.put('agent_skill', skill.id, skill);
    });
    return skill;
  }

  import(input: AgentSkillImportParams): AgentSkill {
    const selected = path.resolve(input.path);
    if (lstatSync(selected).isSymbolicLink() || !lstatSync(selected).isDirectory())
      invalid('请选择真实的本地技能目录');
    // 以真实目录为边界逐个检查文件和引用，拒绝符号链接、越界路径及非文本内容。
    const root = realpathSync.native(selected);
    const read = (relative: string) => {
      const filename = path.join(root, relative);
      const stat = lstatSync(filename);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_REFERENCE_BYTES)
        invalid('技能文件必须是 64 KiB 以内的普通文本文件');
      if (!realpathSync.native(filename).startsWith(`${root}${path.sep}`))
        invalid('技能文件不能离开所选目录');
      const text = readFileSync(filename, 'utf8');
      if (text.includes('\0') || text.includes('\uFFFD')) invalid('技能文件不是有效 UTF-8 文本');
      return text;
    };
    const content = read('SKILL.md');
    if (parseSkill(content).name !== path.basename(root))
      invalid('技能 name 必须与所选目录名称一致');
    const references: AgentSkill['references'] = [];
    const walk = (relative: string, depth: number) => {
      if (depth > 4) invalid('技能引用目录嵌套过深');
      const directory = path.join(root, relative);
      if (lstatSync(directory).isSymbolicLink()) invalid('技能引用不支持符号链接');
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) invalid('技能引用不支持符号链接');
        const name = `${relative}/${entry.name}`;
        if (entry.isDirectory()) walk(name, depth + 1);
        else {
          referenceName(name);
          references.push({ name, text: read(name) });
          if (references.length > MAX_REFERENCES) invalid('技能引用文件超过 100 项');
        }
      }
    };
    const referencesDirectory = path.join(root, 'references');
    let hasReferences = true;
    try {
      lstatSync(referencesDirectory);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
      hasReferences = false;
    }
    if (hasReferences) walk('references', 0);
    return this.save({ content, references, enabled: input.enabled });
  }

  enable({ id, enabled }: { id: string; enabled: boolean }): AgentSkill {
    const skill = this.get(id);
    const updated = { ...skill, enabled, updatedAt: now() };
    this.store.put('agent_skill', id, updated);
    return updated;
  }

  delete({ id }: { id: string }): { deleted: boolean } {
    const exists = !!this.store.get('agent_skill', id);
    this.store.delete('agent_skill', id);
    // Immutable versions remain as evidence for existing turns and approvals.
    return { deleted: exists };
  }

  get(id: string): AgentSkill {
    return this.store.get<AgentSkill | undefined>('agent_skill', id) ?? invalid('技能不存在');
  }

  load(id: string, version?: string): AgentSkill {
    const current = this.get(id);
    if (!current.enabled) throw new RpcError(-32011, '技能已禁用');
    const skill = version
      ? this.store.get<AgentSkill | undefined>('agent_skill_version', `${id}:${version}`)
      : current;
    if (!skill) throw new RpcError(-32004, '技能版本不存在');
    return skill;
  }

  reference(id: string, name: string, version?: string): string {
    const reference = this.load(id, version).references.find(
      (item) => item.name === referenceName(name),
    );
    return reference?.text ?? invalid('技能引用不存在');
  }

  restrictTools(toolNames: readonly string[], skillIds: readonly string[]): string[] {
    let available = [...toolNames];
    for (const id of skillIds) {
      const skill = this.load(id);
      // 未声明 allowed-tools 不收窄权限；显式空值则禁用全部工具，多个 Skill 逐次取交集。
      if (parseSkill(skill.content).restrictTools)
        available = available.filter((name) => skill.allowedTools.includes(name));
    }
    return available;
  }
}

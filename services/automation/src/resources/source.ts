/** 资源读取由宿主注入；能力库只消费选定不可变资源代中的文件与模板标识。 */
export interface AtomicResourceSource {
  /** 宿主限制字节数，并拒绝文件／目录链接、越界路径及读取期间变化的文件。 */
  read(relative: string, maxBytes: number): Promise<Uint8Array | undefined>;
  /** 枚举不完整时保留已安全读取的标识，通过 complete 如实报告。 */
  listTemplates(): Promise<{ ids: string[]; complete: boolean }>;
}

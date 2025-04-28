export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  modelConfig: any
}
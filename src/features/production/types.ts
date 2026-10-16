export interface Operator {
  user_id: string;
  team_id: string;
  role: "admin" | "operator";
  email?: string;
}
export interface Parameters {
  width: number;
  height: number;
  unit: "mm" | "cm" | "in";
  margin: number;
  gap: number;
  rotations: number[];
  quantities: Record<string, number>;
  grain: "none" | "horizontal" | "vertical";
  allowHoles: boolean;
  timeLimit: number;
  material: string;
  machine: string;
  controller: string;
  cam: string;
  format: "svg" | "dxf" | "cdr" | "pdf";
  kerf: number;
  kerfAppliedBy: "CAM" | "none";
  camPending?: boolean;
  tolerance?: number;
}
export interface Piece {
  id: string;
  name: string;
  width: number;
  height: number;
  area: number;
}
export interface Analysis {
  pieces: Piece[];
  warnings: string[];
  duplicates: string[][];
  tolerance: number;
  unit: string;
}
export interface Validation {
  valid: boolean;
  errors: string[];
  pieces: number;
  expected: number;
  utilization?: number;
  camPending: boolean;
  exportScaleChecked?: boolean;
}
export interface Job {
  id: string;
  name: string;
  state: string;
  revision: number;
  parameters: Parameters | null;
  analysis: Analysis | null;
  validation: Validation | null;
  result: { placements: unknown[] } | null;
  updated_at: string;
}
export interface Worker {
  id: string;
  name: string;
  revoked: boolean;
  heartbeat_at: string | null;
  live_authorized: boolean;
  capabilities: {
    corel?: false | { version: string };
    ecut?: boolean;
    formats?: string[];
    operations?: string[];
  };
}
export interface Artifact {
  id: string;
  kind: "original" | "work" | "preview" | "result" | "validation" | "live";
  name: string;
  mime: string;
  size: number;
  created_at: string;
}
export interface Task {
  id: string;
  operation: string;
  state: string;
  progress: number;
  message: string;
  worker_id: string | null;
  lease_until: string | null;
}
export interface JobState {
  job: Job;
  artifacts: Artifact[];
  tasks: Task[];
  events: { id: string; action: string; message: string; created_at: string }[];
  messages: {
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
  workers: Worker[];
}
export const states: Record<string, string> = {
  awaiting_file: "Aguardando arquivo",
  awaiting_analysis: "Pronto para análise",
  awaiting_parameters: "Aguardando parâmetros",
  awaiting_worker: "Aguardando computador de produção",
  ready: "Pronto para encaixar",
  analyzing: "Analisando arquivo",
  nesting: "Executando encaixe",
  validating: "Conferindo resultado",
  completed: "Concluído",
  failed: "Falhou",
};

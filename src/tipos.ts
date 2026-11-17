/** Post como vem da API do Instagram (business_discovery ou /media). */
export interface PostBruto {
  id?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink: string;
  timestamp: string;
}

/** Conta de referência como vem do business_discovery. */
export interface ContaBruta {
  username: string;
  followers_count?: number;
  media_count?: number;
  posts: PostBruto[];
}

/** Post da própria RBTech, com métricas de insights quando disponíveis. */
export interface PostProprio extends PostBruto {
  alcance?: number;
  visualizacoes?: number;
}

/** Tudo o que foi coletado na semana. Pode ser salvo e reaproveitado com `--dados`. */
export interface DadosColetados {
  referencias: ContaBruta[];
  proprios: PostProprio[];
  /** Problemas da coleta (conta não encontrada, token sem permissão...). */
  avisos: string[];
}

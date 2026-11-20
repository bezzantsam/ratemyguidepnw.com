export type WashingtonReviewVersion = (sourceId: string, kind: 'listed' | 'catalog') => string | undefined;
export function washingtonReviewSource(
  sourceId: string,
  env: NodeJS.ProcessEnv,
  versionFor?: WashingtonReviewVersion
): {kind:'prospective' | 'listed' | 'catalog';sourceId:string} | undefined;

export type CaptainFishingDraft = Readonly<{methodIds: string[]; gearIds: string[]; revision: number}>;
export type FishingOption = Readonly<{id: string; label: string; kind: 'method'|'gear'; aliases: readonly string[]}>;
export const fishingOptions: readonly FishingOption[];
export function validFishingSelection(methods: unknown, gear: unknown): boolean;
export function validDraft(value: unknown): value is CaptainFishingDraft;

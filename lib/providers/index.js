import { cgsudanPassportsProvider } from "./cgsudan-passports.js";

export const providers = [cgsudanPassportsProvider];

export const providersById = new Map(providers.map((provider) => [provider.id, provider]));

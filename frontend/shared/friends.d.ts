import type { SharedBillDoc } from './sharedBill.js';
export declare function sanitizeSharedBill(b: unknown): SharedBillDoc;
export declare function createSharedHandler(deps: object): (req: object, res: object) => Promise<unknown>;
export declare function makeMemorySharedDeps(opts?: { users?: Record<string, { id: string; name: string; email?: string; disabled?: boolean }>; persist?: Storage }): object;

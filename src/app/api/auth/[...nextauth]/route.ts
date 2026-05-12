/**
 * NextAuth v5 dynamic route. Re-exports the GET and POST handlers from
 * the single NextAuth() call in src/auth.ts.
 */

import { handlers } from '@/auth';

export const { GET, POST } = handlers;

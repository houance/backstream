// shared/src/index.ts
import { z } from 'zod';

export const createUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Invalid email address'),
    age: z.number().min(18, 'Must be at least 18 years old'),
});

// Infer the type from the schema
export type CreateUser = z.infer<typeof createUserSchema>;

import { PrismaClient } from '@prisma/client';

// On déclare une variable globale pour stocker l'instance Prisma
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// On utilise l'instance existante ou on en crée une nouvelle
export const prisma = globalForPrisma.prisma || new PrismaClient();

// En développement, on sauvegarde l'instance dans la variable globale
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
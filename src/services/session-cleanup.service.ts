import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

export function startSessionCleanup() {
  // Run every day at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    try {
      const result = await prisma.telegramSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      logger.info(
        { deletedCount: result.count },
        'Expired sessions cleaned up'
      );
    } catch (error) {
      logger.error({ err: error }, 'Session cleanup failed');
    }
  });

  logger.info('Session cleanup cron job registered (daily at 03:00)');
}
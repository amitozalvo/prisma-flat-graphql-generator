import { PrismaClient } from './generated/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function setup() {
  console.log('📦 Setting up test database...');

  // Create database schema using Prisma migrate
  try {
    const { stdout, stderr } = await execAsync('npx prisma db push --force-reset --skip-generate', {
      cwd: __dirname,
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    });

    if (stderr && !stderr.includes('warn')) {
      console.error('⚠️  Warnings:', stderr);
    }
    console.log('✅ Database schema created');
  } catch (error: any) {
    console.error('❌ Failed to create schema:', error.message);
    process.exit(1);
  }

  // Seed database
  console.log('🌱 Seeding database...');

  const prisma = new PrismaClient({
    datasourceUrl: 'file:./test.db',
  });

  try {
    // Clean existing data
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.internal.deleteMany();

    // Create test users
    const alice = await prisma.user.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice',
        password: 'secret123',
        posts: {
          create: [
            {
              title: 'Hello World',
              content: 'This is my first post!',
              published: true,
            },
            {
              title: 'GraphQL is Awesome',
              content: 'Learning GraphQL with Prisma',
              published: true,
            },
          ],
        },
      },
    });

    const bob = await prisma.user.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob',
        password: 'secret456',
        posts: {
          create: [
            {
              title: 'Draft Post',
              content: 'This is still a draft',
              published: false,
            },
          ],
        },
      },
    });

    await prisma.internal.create({
      data: {
        data: 'Internal system data',
      },
    });

    console.log('✅ Database seeded successfully!');
    console.log(`Created users: ${alice.name}, ${bob.name}`);
    console.log(`Total posts: ${await prisma.post.count()}`);
  } catch (error: any) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setup();
